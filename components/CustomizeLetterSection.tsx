import React, { useEffect, useRef, useState } from 'react';
import { Researcher, MatchType, EmailStatus } from '../types';
import {
  generateCustomizedLetter,
  reviseCustomizedLetterWithAnnotation,
  DEFAULT_LETTER_MODEL,
  DEFAULT_LETTER_GENERATION_PROMPT_TEMPLATE,
  DEFAULT_LETTER_REVISION_PROMPT_TEMPLATE
} from '../services/geminiService';
import { Sparkles, Wand2, Eye, FileText, Check, X, Copy, Mail, SlidersHorizontal, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

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

interface LetterAiSettings {
  model: string;
  temperature: number | '';
  topP: number | '';
  topK: number | '';
  maxOutputTokens: number | '';
  generationPromptTemplate: string;
  revisionPromptTemplate: string;
}

const ANNOTATION_POPOVER_HIDE_MS = 160;
const LETTER_AI_SETTINGS_STORAGE_KEY = 'customizeLetterAiSettings';
const DEFAULT_LETTER_AI_SETTINGS: LetterAiSettings = {
  model: DEFAULT_LETTER_MODEL,
  temperature: '',
  topP: '',
  topK: '',
  maxOutputTokens: '',
  generationPromptTemplate: DEFAULT_LETTER_GENERATION_PROMPT_TEMPLATE,
  revisionPromptTemplate: DEFAULT_LETTER_REVISION_PROMPT_TEMPLATE
};

const coerceClampedNumber = (
  value: unknown,
  min: number,
  max: number,
  integer = false
): number | '' => {
  if (value === '' || value === null || value === undefined) return '';
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return '';
  const clamped = Math.min(max, Math.max(min, numericValue));
  return integer ? Math.round(clamped) : clamped;
};

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
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [letterAiSettings, setLetterAiSettings] = useState<LetterAiSettings>(DEFAULT_LETTER_AI_SETTINGS);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(LETTER_AI_SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<LetterAiSettings>;
      setLetterAiSettings({
        model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model : DEFAULT_LETTER_MODEL,
        temperature: coerceClampedNumber(parsed.temperature, 0, 2),
        topP: coerceClampedNumber(parsed.topP, 0, 1),
        topK: coerceClampedNumber(parsed.topK, 1, 200, true),
        maxOutputTokens: coerceClampedNumber(parsed.maxOutputTokens, 1, 8192, true),
        generationPromptTemplate: typeof parsed.generationPromptTemplate === 'string' && parsed.generationPromptTemplate.trim()
          ? parsed.generationPromptTemplate
          : DEFAULT_LETTER_GENERATION_PROMPT_TEMPLATE,
        revisionPromptTemplate: typeof parsed.revisionPromptTemplate === 'string' && parsed.revisionPromptTemplate.trim()
          ? parsed.revisionPromptTemplate
          : DEFAULT_LETTER_REVISION_PROMPT_TEMPLATE
      });
    } catch (error) {
      console.error('Failed to load letter AI settings:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LETTER_AI_SETTINGS_STORAGE_KEY, JSON.stringify(letterAiSettings));
  }, [letterAiSettings]);

  const handleModelSettingChange = (value: string) => {
    setLetterAiSettings(prev => ({
      ...prev,
      model: value
    }));
  };

  const handlePromptSettingChange = (
    key: 'generationPromptTemplate' | 'revisionPromptTemplate',
    value: string
  ) => {
    setLetterAiSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleNumericSettingChange = (
    key: 'temperature' | 'topP' | 'topK' | 'maxOutputTokens',
    value: string
  ) => {
    if (value.trim() === '') {
      setLetterAiSettings(prev => ({ ...prev, [key]: '' }));
      return;
    }

    switch (key) {
      case 'temperature':
        setLetterAiSettings(prev => ({ ...prev, temperature: coerceClampedNumber(value, 0, 2) }));
        return;
      case 'topP':
        setLetterAiSettings(prev => ({ ...prev, topP: coerceClampedNumber(value, 0, 1) }));
        return;
      case 'topK':
        setLetterAiSettings(prev => ({ ...prev, topK: coerceClampedNumber(value, 1, 200, true) }));
        return;
      case 'maxOutputTokens':
        setLetterAiSettings(prev => ({ ...prev, maxOutputTokens: coerceClampedNumber(value, 1, 8192, true) }));
        return;
    }
  };

  const resetLetterAiSettings = () => {
    setLetterAiSettings(DEFAULT_LETTER_AI_SETTINGS);
  };

  const buildLetterModelOptions = () => ({
    model: letterAiSettings.model.trim() || DEFAULT_LETTER_MODEL,
    temperature: typeof letterAiSettings.temperature === 'number' ? letterAiSettings.temperature : undefined,
    topP: typeof letterAiSettings.topP === 'number' ? letterAiSettings.topP : undefined,
    topK: typeof letterAiSettings.topK === 'number' ? letterAiSettings.topK : undefined,
    maxOutputTokens: typeof letterAiSettings.maxOutputTokens === 'number' ? letterAiSettings.maxOutputTokens : undefined
  });

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

  const handleSendEmail = async (researcher: Researcher) => {
    const subject = emailTitle || 'Inquiry regarding your research - academic-outreach-explorer';
    const body = researcher.customizedLetter || '';
    const recipient = researcher.contactEmail?.trim() || '';
    const mailtoLink = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // Keep mailto launch in the same user gesture to avoid browser blocking.
    void handleCopyRichText(body).catch((error) => {
      console.error('Copy before send failed:', error);
    });
    window.location.href = mailtoLink;
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
        const customLetter = await generateCustomizedLetter(letterTemplate, researcher, userInterests, {
          ...buildLetterModelOptions(),
          promptTemplate: letterAiSettings.generationPromptTemplate
        });
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
          userInterests,
          {
            ...buildLetterModelOptions(),
            promptTemplate: letterAiSettings.revisionPromptTemplate
          }
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
      <div className="bg-white rounded-[24px] border border-black/5 p-5 shadow-apple">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[#1D1D1F] flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#0071E3]" />
              AI Prompt & Parameters
            </h3>
            <p className="text-xs text-[#86868B] mt-1">
              Edit generation/revision prompts and optional Gemini sampling settings.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetLetterAiSettings}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/10 text-xs font-medium text-[#424245] hover:bg-[#F5F5F7] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Defaults
            </button>
            <button
              onClick={() => setIsAiSettingsOpen(prev => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0071E3] text-white text-xs font-semibold hover:bg-[#0077ED] transition-colors"
            >
              {isAiSettingsOpen ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Configure
                </>
              )}
            </button>
          </div>
        </div>

        {isAiSettingsOpen && (
          <div className="mt-4 pt-4 border-t border-black/5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide">Model</span>
                <input
                  type="text"
                  value={letterAiSettings.model}
                  onChange={(event) => handleModelSettingChange(event.target.value)}
                  placeholder="gemini-3-pro-preview"
                  className="h-9 rounded-lg border border-black/10 px-3 text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide">Temperature (0-2)</span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={letterAiSettings.temperature}
                  onChange={(event) => handleNumericSettingChange('temperature', event.target.value)}
                  placeholder="default"
                  className="h-9 rounded-lg border border-black/10 px-3 text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide">Top P (0-1)</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={letterAiSettings.topP}
                  onChange={(event) => handleNumericSettingChange('topP', event.target.value)}
                  placeholder="default"
                  className="h-9 rounded-lg border border-black/10 px-3 text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide">Top K</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  step={1}
                  value={letterAiSettings.topK}
                  onChange={(event) => handleNumericSettingChange('topK', event.target.value)}
                  placeholder="default"
                  className="h-9 rounded-lg border border-black/10 px-3 text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide">Max Output</span>
                <input
                  type="number"
                  min={1}
                  max={8192}
                  step={1}
                  value={letterAiSettings.maxOutputTokens}
                  onChange={(event) => handleNumericSettingChange('maxOutputTokens', event.target.value)}
                  placeholder="default"
                  className="h-9 rounded-lg border border-black/10 px-3 text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide">Generation Prompt</span>
                <textarea
                  value={letterAiSettings.generationPromptTemplate}
                  onChange={(event) => handlePromptSettingChange('generationPromptTemplate', event.target.value)}
                  rows={12}
                  className="rounded-lg border border-black/10 px-3 py-2 text-xs leading-relaxed text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide">Revision Prompt</span>
                <textarea
                  value={letterAiSettings.revisionPromptTemplate}
                  onChange={(event) => handlePromptSettingChange('revisionPromptTemplate', event.target.value)}
                  rows={12}
                  className="rounded-lg border border-black/10 px-3 py-2 text-xs leading-relaxed text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30"
                />
              </label>
            </div>

            <p className="text-[11px] text-[#86868B] leading-relaxed">
              Placeholders:
              {' '}
              <code>{'{{professor_name}}'}</code>
              {' '}
              <code>{'{{professor_last_name}}'}</code>
              {' '}
              <code>{'{{student_template}}'}</code>
              {' '}
              <code>{'{{user_interests}}'}</code>
              {' '}
              <code>{'{{researcher_themes}}'}</code>
              {' '}
              <code>{'{{researcher_summary}}'}</code>
              {' '}
              <code>{'{{intersection_keywords}}'}</code>
              {' '}
              <code>{'{{current_letter}}'}</code>
              {' '}
              <code>{'{{selected_text}}'}</code>
              {' '}
              <code>{'{{annotation}}'}</code>
              .
            </p>
          </div>
        )}
      </div>

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
                  <div className="absolute top-6 right-12 bg-[#FFD60A]/15 text-[#B8860B] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#FFD60A]/40 flex items-center gap-1 z-10 backdrop-blur-sm">
                    <Sparkles className="w-3 h-3 fill-current" />
                    Perfect Match
                  </div>
                )}
                {researcher.matchType === MatchType.HIGH && (
                  <div className="absolute top-6 right-12 bg-[#AF52DE]/10 text-[#AF52DE] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#AF52DE]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
                    <Sparkles className="w-3 h-3 fill-current" />
                    High Match
                  </div>
                )}
                {researcher.matchType === MatchType.PARTIAL && (
                  <div className="absolute top-6 right-12 bg-[#34C759]/10 text-[#34C759] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#34C759]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
                    <Sparkles className="w-3 h-3 fill-current" />
                    Partial Match
                  </div>
                )}
                {researcher.matchType === MatchType.LOW && (
                  <div className="absolute top-6 right-12 bg-[#0071E3]/10 text-[#0071E3] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#0071E3]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
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
                    <div className="pt-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center h-5 text-[10px] font-bold uppercase tracking-wider px-2.5 rounded-full ${getEmailStatusColor(researcher.emailStatus || EmailStatus.NOT_SENT)}`}>
                          {getEmailStatusLabel(researcher.emailStatus || EmailStatus.NOT_SENT)}
                        </span>
                      </div>
                      {researcher.homepageUrl ? (
                        <a
                          href={researcher.homepageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 block text-lg font-bold text-[#1D1D1F] leading-tight tracking-tight hover:underline"
                        >
                          {researcher.name}
                        </a>
                      ) : (
                        <h3 className="mt-1.5 text-lg font-bold text-[#1D1D1F] leading-tight tracking-tight">
                          {researcher.name}
                        </h3>
                      )}
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
                {selectedResearcherForView.contactEmail && (
                  <p className="text-[11px] text-[#0071E3] mt-1">
                    Detected email: {selectedResearcherForView.contactEmail}
                  </p>
                )}
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
                onClick={() => handleSendEmail(selectedResearcherForView)}
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
