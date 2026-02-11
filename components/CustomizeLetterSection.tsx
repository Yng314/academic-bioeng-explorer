import React, { useRef, useState } from 'react';
import { Researcher, MatchType, EmailStatus } from '../types';
import { generateCustomizedLetter } from '../services/geminiService';
import { Sparkles, Wand2, Eye, FileText, Check, X, Copy, Mail } from 'lucide-react';

interface CustomizeLetterSectionProps {
  favoriteResearchers: Researcher[];
  letterTemplate: string;
  emailTitle: string;
  userInterests: string;
  onUpdateResearcher: (id: string, updates: Partial<Researcher>) => void;
}

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
  const pendingGenerationIdsRef = useRef<Set<string>>(new Set());
  const generationQueueRef = useRef<Promise<void>>(Promise.resolve());

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
      console.error("Rich text copy failed:", error);
      try {
        await navigator.clipboard.writeText(plainText);
        setCopyButtonState('success');
      } catch (fallbackError) {
        console.error("Plain text copy fallback failed:", fallbackError);
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
      } catch (error) {
        console.error("Failed to customize letter:", error);
        alert(`Failed to generate letter for ${researcher.name}. Please try again.`);
      } finally {
        pendingGenerationIdsRef.current.delete(researcher.id);
        setPendingGenerationIds(new Set(pendingGenerationIdsRef.current));
      }
    });
  };

  const selectedResearcherForView = favoriteResearchers.find(r => r.id === viewLetterId);

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
                {/* Match Badge - Consistent placement */}
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

                {/* Header - Matching ResultsGrid p-6 pb-4 */}
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

                {/* Body - Matching ResultsGrid px-6 pb-6 */}
                <div className="px-6 pb-6 flex-grow flex flex-col gap-5">
                  {/* Simplified Keywords */}
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

                  {/* Actions */}
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
                      onClick={() => setViewLetterId(researcher.id)}
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

      {/* View Letter Modal */}
      {viewLetterId && selectedResearcherForView && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white/90 backdrop-blur-2xl rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-modal-in border border-white/20">
              <div className="px-6 py-4 flex items-center justify-between">
                 <h3 className="font-semibold text-[#1D1D1F] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#0071E3]" />
                    Draft for {selectedResearcherForView.name}
                 </h3>
                 <button 
                   onClick={() => setViewLetterId(null)}
                   className="p-1.5 rounded-full hover:bg-black/5 text-slate-500 transition-colors"
                 >
                   <X className="w-5 h-5" />
                 </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1 bg-transparent">
                 <div className="prose prose-sm max-w-none font-mono text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {selectedResearcherForView.customizedLetter}
                 </div>
              </div>
 
              <div className="px-6 py-4 flex justify-end gap-3 relative">
                 <button
                   onClick={() => {
                     const subject = emailTitle || `Inquiry regarding your research - academic-outreach-explorer`;
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
        </div>
      )}

    </div>
  );
};

function getEmailStatusColor(status: EmailStatus) {
  switch (status) {
    case EmailStatus.NOT_SENT:
      return 'bg-[#86868B]/10 text-[#86868B]'; // Gray/Neutral style
    case EmailStatus.SENT:
      return 'bg-[#34C759]/10 text-[#34C759]'; // Green/Success style
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
