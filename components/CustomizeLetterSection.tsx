import React, { useEffect, useRef, useState } from 'react';
import { Researcher, MatchType, EmailStatus } from '../types';
import { generateCustomizedLetter, reviseCustomizedLetterWithAnnotation } from '../services/geminiService';
import { Sparkles, Wand2, Eye, FileText, Check, X, Copy, Mail } from 'lucide-react';

interface CustomizeLetterSectionProps {
  favoriteResearchers: Researcher[];
  letterTemplate: string;
  emailTitle: string;
  userInterests: string;
  onUpdateResearcher: (id: string, updates: Partial<Researcher>) => void;
}

interface AnnotationPopoverState {
  top: number;
  left: number;
  width: number;
  selectedText: string;
  note: string;
  hasMouseEntered: boolean;
}

interface RevisionPreviewState {
  researcherId: string;
  revisedLetter: string;
  start: number;
  end: number;
  beforeText: string;
  afterText: string;
}

interface AnnotationStatusState {
  tone: 'info' | 'success' | 'error';
  message: string;
}

const ANNOTATION_POPOVER_HIDE_MS = 160;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const stripFormattingMarkers = (value: string): string =>
  value
    .replace(/\[\[B\]\]([\s\S]*?)\[\[\/B\]\]/g, '$1')
    .replace(/\*\*\*\*([\s\S]*?)\*\*\*\*/g, '$1')
    .replace(/\*\*([\s\S]*?)\*\*/g, '$1');

const buildRichTextHtml = (value: string): string => {
  const normalized = value.replace(/\r\n/g, '\n');
  const markerPattern = /\[\[B\]\]([\s\S]*?)\[\[\/B\]\]|\*\*\*\*([\s\S]*?)\*\*\*\*|\*\*([\s\S]*?)\*\*/g;
  let html = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markerPattern.exec(normalized)) !== null) {
    html += escapeHtml(normalized.slice(lastIndex, match.index));
    const boldContent = match[1] ?? match[2] ?? match[3] ?? '';
    html += `<strong style="font-weight: 700;">${escapeHtml(boldContent)}</strong>`;
    lastIndex = markerPattern.lastIndex;
  }

  html += escapeHtml(normalized.slice(lastIndex));
  const bodyHtml = html.replace(/\n/g, '<br>');
  return `<div style="font-family: Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #000000;">${bodyHtml}</div>`;
};

const getAdaptivePopoverWidth = (selectedText: string): number => {
  const minWidth = 320;
  const maxWidth = Math.min(680, window.innerWidth - 24);
  const longestLineChars = selectedText
    .split('\n')
    .reduce((max, line) => Math.max(max, line.length), 0);

  const estimated = Math.round(longestLineChars * 7 + 96);
  return Math.max(minWidth, Math.min(maxWidth, estimated));
};

const buildRevisionPreview = (
  currentLetter: string,
  revisedLetter: string,
  selectedText: string,
  researcherId: string
): RevisionPreviewState => {
  const selectedStart = selectedText ? currentLetter.indexOf(selectedText) : -1;

  if (selectedStart >= 0) {
    const prefix = currentLetter.slice(0, selectedStart);
    const suffix = currentLetter.slice(selectedStart + selectedText.length);

    if (revisedLetter.startsWith(prefix) && revisedLetter.endsWith(suffix)) {
      return {
        researcherId,
        revisedLetter,
        start: selectedStart,
        end: selectedStart + selectedText.length,
        beforeText: selectedText,
        afterText: revisedLetter.slice(prefix.length, revisedLetter.length - suffix.length)
      };
    }
  }

  let prefixLen = 0;
  const maxPrefix = Math.min(currentLetter.length, revisedLetter.length);
  while (prefixLen < maxPrefix && currentLetter[prefixLen] === revisedLetter[prefixLen]) {
    prefixLen += 1;
  }

  let suffixLen = 0;
  const maxSuffix = Math.min(
    currentLetter.length - prefixLen,
    revisedLetter.length - prefixLen
  );
  while (
    suffixLen < maxSuffix &&
    currentLetter[currentLetter.length - 1 - suffixLen] === revisedLetter[revisedLetter.length - 1 - suffixLen]
  ) {
    suffixLen += 1;
  }

  return {
    researcherId,
    revisedLetter,
    start: prefixLen,
    end: currentLetter.length - suffixLen,
    beforeText: currentLetter.slice(prefixLen, currentLetter.length - suffixLen),
    afterText: revisedLetter.slice(prefixLen, revisedLetter.length - suffixLen)
  };
};

export const CustomizeLetterSection: React.FC<CustomizeLetterSectionProps> = ({
  favoriteResearchers,
  letterTemplate,
  emailTitle,
  userInterests,
  onUpdateResearcher
}) => {
  const [pendingGenerationIds, setPendingGenerationIds] = useState<Set<string>>(new Set());
  const [copyButtonState, setCopyButtonState] = useState<'idle' | 'success' | 'failed'>('idle');
  const [viewLetterId, setViewLetterId] = useState<string | null>(null);
  const [annotationPopover, setAnnotationPopover] = useState<AnnotationPopoverState | null>(null);
  const [isAnnotationPopoverVisible, setIsAnnotationPopoverVisible] = useState(false);
  const [revisionPreview, setRevisionPreview] = useState<RevisionPreviewState | null>(null);
  const [annotationStatus, setAnnotationStatus] = useState<AnnotationStatusState | null>(null);

  const pendingGenerationIdsRef = useRef<Set<string>>(new Set());
  const generationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const letterBodyRef = useRef<HTMLDivElement | null>(null);
  const annotationPopoverRef = useRef<HTMLDivElement | null>(null);
  const annotationHideTimerRef = useRef<number | null>(null);

  const clearAnnotationHideTimer = () => {
    if (annotationHideTimerRef.current !== null) {
      window.clearTimeout(annotationHideTimerRef.current);
      annotationHideTimerRef.current = null;
    }
  };

  const closeAnnotationPopover = (immediate = false) => {
    if (!annotationPopover) return;
    clearAnnotationHideTimer();
    setIsAnnotationPopoverVisible(false);
    if (immediate) {
      setAnnotationPopover(null);
      return;
    }
    annotationHideTimerRef.current = window.setTimeout(() => {
      setAnnotationPopover(null);
      annotationHideTimerRef.current = null;
    }, ANNOTATION_POPOVER_HIDE_MS);
  };

  useEffect(() => {
    return () => {
      if (annotationHideTimerRef.current !== null) {
        window.clearTimeout(annotationHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (viewLetterId) return;
    clearAnnotationHideTimer();
    setAnnotationPopover(null);
    setIsAnnotationPopoverVisible(false);
    setRevisionPreview(null);
    setAnnotationStatus(null);
    setCopyButtonState('idle');
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
  }, [viewLetterId]);

  useEffect(() => {
    if (!annotationPopover || !isAnnotationPopoverVisible) return;
    const node = annotationPopoverRef.current;
    if (!node) return;

    const viewportPadding = 12;
    const rect = node.getBoundingClientRect();
    let nextLeft = annotationPopover.left;
    let nextTop = annotationPopover.top;

    if (rect.right > window.innerWidth - viewportPadding) {
      nextLeft -= rect.right - (window.innerWidth - viewportPadding);
    }
    if (rect.left < viewportPadding) {
      nextLeft = viewportPadding;
    }
    if (rect.bottom > window.innerHeight - viewportPadding) {
      nextTop -= rect.bottom - (window.innerHeight - viewportPadding);
    }
    if (rect.top < viewportPadding) {
      nextTop = viewportPadding;
    }

    if (nextLeft !== annotationPopover.left || nextTop !== annotationPopover.top) {
      setAnnotationPopover(prev => (
        prev ? { ...prev, left: nextLeft, top: nextTop } : prev
      ));
    }
  }, [annotationPopover, isAnnotationPopoverVisible]);

  const handleCopyRichText = async (letter: string): Promise<void> => {
    const plainText = stripFormattingMarkers(letter);
    const htmlText = buildRichTextHtml(letter);

    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const clipboardItem = new ClipboardItem({
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
          'text/html': new Blob([htmlText], { type: 'text/html' })
        });
        await navigator.clipboard.write([clipboardItem]);
        setCopyButtonState('success');
        return;
      }

      await navigator.clipboard.writeText(plainText);
      setCopyButtonState('success');
    } catch (error) {
      console.error('Rich text copy failed:', error);
      try {
        await navigator.clipboard.writeText(plainText);
        setCopyButtonState('success');
      } catch (fallbackError) {
        console.error('Plain text copy fallback failed:', fallbackError);
        setCopyButtonState('failed');
      }
    }
  };

  const handleCustomize = (researcher: Researcher) => {
    if (!letterTemplate.trim()) {
      alert("Please define your Letter Template in 'My Profile' first.");
      return;
    }

    if (pendingGenerationIdsRef.current.has(researcher.id)) {
      return;
    }

    pendingGenerationIdsRef.current.add(researcher.id);
    setPendingGenerationIds(new Set(pendingGenerationIdsRef.current));

    generationQueueRef.current = generationQueueRef.current.then(async () => {
      try {
        const customLetter = await generateCustomizedLetter(letterTemplate, researcher, userInterests);
        onUpdateResearcher(researcher.id, { customizedLetter: customLetter });

        if (viewLetterId === researcher.id) {
          setRevisionPreview(null);
          setAnnotationStatus({ tone: 'success', message: 'Letter regenerated.' });
        }
      } catch (error) {
        console.error('Failed to customize letter:', error);
        alert(`Failed to generate letter for ${researcher.name}. Please try again.`);
      } finally {
        pendingGenerationIdsRef.current.delete(researcher.id);
        setPendingGenerationIds(new Set(pendingGenerationIdsRef.current));
      }
    });
  };

  const selectedResearcherForView = favoriteResearchers.find(r => r.id === viewLetterId);
  const isSelectedResearcherGenerating = selectedResearcherForView
    ? pendingGenerationIds.has(selectedResearcherForView.id)
    : false;
  const hasActiveRevisionPreview = Boolean(
    selectedResearcherForView &&
    revisionPreview &&
    revisionPreview.researcherId === selectedResearcherForView.id
  );

  const handleLetterMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedResearcherForView || isSelectedResearcherGenerating) return;

    if (hasActiveRevisionPreview) {
      setAnnotationStatus({
        tone: 'info',
        message: 'Please accept or reject the current change before selecting a new range.'
      });
      return;
    }

    window.setTimeout(() => {
      const selection = window.getSelection();
      const letterContainer = letterBodyRef.current;

      if (
        !selection ||
        selection.rangeCount === 0 ||
        selection.isCollapsed ||
        !letterContainer
      ) {
        closeAnnotationPopover();
        return;
      }

      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      if (!anchorNode || !focusNode) {
        closeAnnotationPopover();
        return;
      }
      if (!letterContainer.contains(anchorNode) || !letterContainer.contains(focusNode)) {
        closeAnnotationPopover();
        return;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText) {
        closeAnnotationPopover();
        return;
      }

      const popoverWidth = getAdaptivePopoverWidth(selectedText);
      const viewportPadding = 12;

      let left = event.clientX + 10;
      let top = event.clientY + 12;

      if (left + popoverWidth > window.innerWidth - viewportPadding) {
        left = window.innerWidth - popoverWidth - viewportPadding;
      }
      if (left < viewportPadding) left = viewportPadding;
      if (top < viewportPadding) top = viewportPadding;

      clearAnnotationHideTimer();
      setAnnotationPopover({
        top,
        left,
        width: popoverWidth,
        selectedText,
        note: '',
        hasMouseEntered: false
      });
      setAnnotationStatus(null);
      setIsAnnotationPopoverVisible(false);
      window.requestAnimationFrame(() => {
        setIsAnnotationPopoverVisible(true);
      });
    }, 0);
  };

  const handleSubmitAnnotation = () => {
    if (!selectedResearcherForView || !annotationPopover) return;

    const annotationNote = annotationPopover.note.trim();
    const currentLetter = selectedResearcherForView.customizedLetter || '';
    if (!annotationNote || !currentLetter) return;
    if (pendingGenerationIdsRef.current.has(selectedResearcherForView.id)) return;

    pendingGenerationIdsRef.current.add(selectedResearcherForView.id);
    setPendingGenerationIds(new Set(pendingGenerationIdsRef.current));
    setAnnotationStatus({ tone: 'info', message: 'Generating targeted revision...' });

    generationQueueRef.current = generationQueueRef.current.then(async () => {
      try {
        const revisedLetter = await reviseCustomizedLetterWithAnnotation(
          currentLetter,
          annotationPopover.selectedText,
          annotationNote,
          selectedResearcherForView,
          userInterests
        );

        if (revisedLetter.trim() === currentLetter.trim()) {
          setAnnotationStatus({
            tone: 'info',
            message: 'No clear change was generated. Try a more specific annotation.'
          });
          closeAnnotationPopover(true);
          return;
        }

        const preview = buildRevisionPreview(
          currentLetter,
          revisedLetter,
          annotationPopover.selectedText,
          selectedResearcherForView.id
        );

        setRevisionPreview(preview);
        setAnnotationStatus({
          tone: 'success',
          message: 'Change preview ready. Use ✓ or ✕ next to the highlighted text.'
        });

        window.getSelection()?.removeAllRanges();
        closeAnnotationPopover(true);
      } catch (error) {
        console.error('Failed to revise letter with annotation:', error);
        setAnnotationStatus({ tone: 'error', message: 'Failed to generate revision. Please retry.' });
        alert(`Failed to revise letter for ${selectedResearcherForView.name}. Please try again.`);
      } finally {
        pendingGenerationIdsRef.current.delete(selectedResearcherForView.id);
        setPendingGenerationIds(new Set(pendingGenerationIdsRef.current));
      }
    });
  };

  const handleAcceptRevision = () => {
    if (!selectedResearcherForView || !revisionPreview) return;
    if (revisionPreview.researcherId !== selectedResearcherForView.id) return;

    onUpdateResearcher(selectedResearcherForView.id, {
      customizedLetter: revisionPreview.revisedLetter
    });

    setRevisionPreview(null);
    setAnnotationStatus({ tone: 'success', message: 'Revision applied.' });
    window.getSelection()?.removeAllRanges();
  };

  const handleRejectRevision = () => {
    if (!selectedResearcherForView || !revisionPreview) return;
    if (revisionPreview.researcherId !== selectedResearcherForView.id) return;

    setRevisionPreview(null);
    setAnnotationStatus({ tone: 'info', message: 'Revision discarded.' });
    window.getSelection()?.removeAllRanges();
  };

  const renderLetterContent = () => {
    if (!selectedResearcherForView) return null;

    const currentLetter = selectedResearcherForView.customizedLetter || '';
    if (
      !revisionPreview ||
      revisionPreview.researcherId !== selectedResearcherForView.id
    ) {
      return currentLetter;
    }

    const safeStart = Math.max(0, Math.min(revisionPreview.start, currentLetter.length));
    const safeEnd = Math.max(safeStart, Math.min(revisionPreview.end, currentLetter.length));

    const prefix = currentLetter.slice(0, safeStart);
    const originalSegment = currentLetter.slice(safeStart, safeEnd);
    const suffix = currentLetter.slice(safeEnd);

    const before = originalSegment || revisionPreview.beforeText || '[empty]';
    const after = revisionPreview.afterText || '[removed]';

    return (
      <>
        {prefix}
        <span className="inline rounded bg-red-50 px-1 text-red-600 line-through decoration-red-400">
          {before}
        </span>
        <span className="mx-1 text-[#86868B]">→</span>
        <span className="inline rounded bg-emerald-50 px-1 text-emerald-700">
          {after}
        </span>
        <span className="inline-flex align-middle items-center gap-1 ml-2">
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleAcceptRevision();
            }}
            className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm hover:bg-emerald-600 transition-colors"
            title="Accept change"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleRejectRevision();
            }}
            className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm hover:bg-red-600 transition-colors"
            title="Reject change"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
        {suffix}
      </>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-6 pt-6 pb-20 space-y-6 animate-in fade-in slide-in-from-bottom-4">

      {favoriteResearchers.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-[24px] border border-dashed border-slate-300">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">No Favorites Yet</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Star professors in the "Find Professor" tab to add them here and customize your outreach emails.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {favoriteResearchers.map(researcher => {
            const hasLetter = !!researcher.customizedLetter;
            const isPendingGeneration = pendingGenerationIds.has(researcher.id);

            return (
              <div key={researcher.id} className="relative flex flex-col h-full bg-white rounded-[24px] shadow-apple hover:shadow-apple-hover border border-black/5 transition-all duration-300">
                {researcher.matchType === MatchType.PERFECT && (
                  <div className="absolute top-4 right-12 bg-[#FFD60A]/15 text-[#B8860B] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#FFD60A]/40 flex items-center gap-1 z-10 backdrop-blur-sm">
                    <Sparkles className="w-3 h-3 fill-current" />
                    Perfect Match
                  </div>
                )}
                {researcher.matchType === MatchType.HIGH && (
                  <div className="absolute top-4 right-12 bg-[#AF52DE]/10 text-[#AF52DE] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#AF52DE]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
                    <Sparkles className="w-3 h-3 fill-current" />
                    High Match
                  </div>
                )}
                {researcher.matchType === MatchType.PARTIAL && (
                  <div className="absolute top-4 right-12 bg-[#34C759]/10 text-[#34C759] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#34C759]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
                    <Sparkles className="w-3 h-3 fill-current" />
                    Partial Match
                  </div>
                )}
                {researcher.matchType === MatchType.LOW && (
                  <div className="absolute top-4 right-12 bg-[#0071E3]/10 text-[#0071E3] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#0071E3]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
                    <Sparkles className="w-3 h-3 fill-current" />
                    Low Match
                  </div>
                )}

                <div className="p-6 pb-4 flex items-start justify-between gap-4 rounded-t-[24px]">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-[#F5F5F7] text-[#86868B] overflow-hidden border border-black/5">
                      {researcher.avatarUrl ? (
                        <img
                          src={researcher.avatarUrl}
                          alt={researcher.name}
                          className="w-full h-full object-cover shadow-inner"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#F5F5F7] to-[#E8E8ED] text-[#86868B] text-lg font-bold">
                          {researcher.name[0]}
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-[#1D1D1F] leading-tight tracking-tight">
                        {researcher.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${getEmailStatusColor(researcher.emailStatus || EmailStatus.NOT_SENT)}`}>
                          {getEmailStatusLabel(researcher.emailStatus || EmailStatus.NOT_SENT)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 pb-6 flex-grow flex flex-col gap-5">
                  <div className="flex flex-wrap gap-2">
                    {researcher.tags?.slice(0, 3).map((tag, idx) => (
                      <span key={idx} className="px-2 py-1 bg-[#F5F5F7] text-[#1D1D1F] text-xs rounded-md border border-[#D2D2D7]/50">
                        {tag.keyword}
                      </span>
                    ))}
                    {(researcher.tags?.length || 0) > 3 && (
                      <span className="px-2 py-1 text-[#86868B] text-xs">
                        +{researcher.tags!.length - 3} more
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 mt-auto">
                    <button
                      onClick={() => handleCustomize(researcher)}
                      disabled={isPendingGeneration}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                        hasLetter
                          ? 'bg-[#E8E8ED] text-[#1D1D1F] hover:bg-[#D2D2D7]'
                          : 'bg-[#0071E3] text-white hover:bg-[#0077ED] shadow-apple hover:shadow-apple-hover'
                      }`}
                    >
                      {isPendingGeneration ? (
                        <>
                          <Wand2 className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          {hasLetter ? 'Regenerate Letter' : 'Customize Letter'}
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setCopyButtonState('idle');
                        setAnnotationStatus(null);
                        setRevisionPreview(null);
                        setViewLetterId(researcher.id);
                      }}
                      disabled={!hasLetter}
                      className={`w-full flex items-center justify-center gap-2 text-xs font-medium transition-colors ${
                        hasLetter
                          ? 'text-[#0071E3] hover:underline cursor-pointer'
                          : 'text-[#86868B]/50 cursor-not-allowed'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Letter
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewLetterId && selectedResearcherForView && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white/90 backdrop-blur-2xl rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-modal-in border border-white/20">
            <div className="px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-[#1D1D1F] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#0071E3]" />
                  Draft for {selectedResearcherForView.name}
                </h3>
                <p className="text-[11px] text-[#86868B] mt-1">
                  Select text, annotate, then review red/green change with ✓ or ✕.
                </p>
                {annotationStatus && (
                  <p className={`text-[11px] mt-1.5 ${
                    annotationStatus.tone === 'success'
                      ? 'text-emerald-600'
                      : annotationStatus.tone === 'error'
                        ? 'text-red-500'
                        : 'text-[#0071E3]'
                  }`}>
                    {annotationStatus.message}
                  </p>
                )}
              </div>
              <button
                onClick={() => setViewLetterId(null)}
                className="p-1.5 rounded-full hover:bg-black/5 text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-transparent">
              <div
                ref={letterBodyRef}
                onMouseUp={handleLetterMouseUp}
                className="prose prose-sm max-w-none font-mono text-sm leading-relaxed text-slate-700 whitespace-pre-wrap cursor-text select-text"
              >
                {renderLetterContent()}
              </div>
            </div>

            <div className="px-6 py-4 flex justify-end gap-3 relative">
              <button
                onClick={() => {
                  const subject = emailTitle || 'Inquiry regarding your research - academic-outreach-explorer';
                  const body = selectedResearcherForView.customizedLetter || '';
                  const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                  window.location.href = mailtoLink;
                }}
                className="flex items-center gap-2 px-4 py-2 bg-[#0071E3] text-white rounded-lg text-sm font-medium hover:bg-[#0077ED] transition-colors shadow-sm"
              >
                <Mail className="w-4 h-4" />
                Send Email
              </button>
              <button
                onClick={() => {
                  handleCopyRichText(selectedResearcherForView.customizedLetter || '');
                }}
                onMouseLeave={() => setCopyButtonState('idle')}
                className={`flex items-center gap-2 px-4 py-2 border border-black/5 rounded-lg text-sm font-medium transition-colors ${
                  copyButtonState === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : copyButtonState === 'failed'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-white/50 hover:bg-white text-slate-700'
                }`}
              >
                <Copy className="w-4 h-4" />
                {copyButtonState === 'success'
                  ? 'Copy Succeeded'
                  : copyButtonState === 'failed'
                    ? 'Copy Failed'
                    : 'Copy Rich Text'}
              </button>
              <button
                onClick={() => setViewLetterId(null)}
                className="px-4 py-2 bg-black/5 text-slate-700 border border-black/5 rounded-lg text-sm font-medium hover:bg-black/10 transition-colors"
              >
                Done
              </button>
            </div>
          </div>

          {annotationPopover && (
            <div
              ref={annotationPopoverRef}
              onMouseEnter={() => {
                setAnnotationPopover(prev => (
                  prev ? { ...prev, hasMouseEntered: true } : prev
                ));
              }}
              onMouseLeave={() => {
                if (!annotationPopover.hasMouseEntered || isSelectedResearcherGenerating) return;
                closeAnnotationPopover();
              }}
              style={{ top: annotationPopover.top, left: annotationPopover.left, width: annotationPopover.width }}
              className={`fixed z-[120] max-w-[calc(100vw-24px)] rounded-2xl border border-black/5 bg-white/90 backdrop-blur-2xl shadow-2xl p-3 transition-all duration-150 ${
                isAnnotationPopoverVisible
                  ? 'opacity-100 scale-100 translate-y-0'
                  : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#86868B] mb-1">
                Annotation
              </p>
              <p className="text-[11px] leading-relaxed text-[#424245] bg-[#F5F5F7] border border-black/5 rounded-xl px-2.5 py-2 mb-2 whitespace-pre-wrap break-words max-h-[38vh] overflow-y-auto">
                “{annotationPopover.selectedText}”
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={annotationPopover.note}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAnnotationPopover(prev => (
                      prev ? { ...prev, note: value } : prev
                    ));
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.shiftKey) return;
                    event.preventDefault();
                    handleSubmitAnnotation();
                  }}
                  placeholder="Add your revision note..."
                  disabled={isSelectedResearcherGenerating}
                  className="flex-1 h-9 rounded-full border border-black/10 bg-white px-3 text-xs text-[#1D1D1F] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30 disabled:opacity-60"
                />
                <button
                  onClick={handleSubmitAnnotation}
                  disabled={!annotationPopover.note.trim() || isSelectedResearcherGenerating}
                  className="w-9 h-9 rounded-full bg-[#0071E3] text-white flex items-center justify-center shadow-sm hover:bg-[#0077ED] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Submit annotation"
                >
                  {isSelectedResearcherGenerating ? (
                    <Wand2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

function getEmailStatusColor(status: EmailStatus) {
  switch (status) {
    case EmailStatus.NOT_SENT:
      return 'bg-[#86868B]/10 text-[#86868B]';
    case EmailStatus.SENT:
      return 'bg-[#34C759]/10 text-[#34C759]';
    default:
      return 'bg-[#F5F5F7] text-[#86868B]';
  }
}

function getEmailStatusLabel(status: EmailStatus) {
  switch (status) {
    case EmailStatus.NOT_SENT:
      return 'Not Sent';
    case EmailStatus.SENT:
      return 'Email Sent';
    default:
      return 'Unknown';
  }
}
