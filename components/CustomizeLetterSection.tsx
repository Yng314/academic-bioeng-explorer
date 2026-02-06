import React, { useState } from 'react';
import { Researcher, MatchType } from '../types';
import { generateCustomizedLetter } from '../services/geminiService';
import { Sparkles, Wand2, Eye, FileText, Check, X, Copy, Mail } from 'lucide-react';

interface CustomizeLetterSectionProps {
  favoriteResearchers: Researcher[];
  letterTemplate: string;
  emailTitle: string;
  userInterests: string;
  onUpdateResearcher: (id: string, updates: Partial<Researcher>) => void;
}

export const CustomizeLetterSection: React.FC<CustomizeLetterSectionProps> = ({
  favoriteResearchers,
  letterTemplate,
  emailTitle,
  userInterests,
  onUpdateResearcher
}) => {
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [viewLetterId, setViewLetterId] = useState<string | null>(null);

  const handleCustomize = async (researcher: Researcher) => {
    if (!letterTemplate.trim()) {
      alert("Please define your Letter Template in 'My Profile' first.");
      return;
    }

    setGeneratingId(researcher.id);
    try {
      const customLetter = await generateCustomizedLetter(letterTemplate, researcher, userInterests);
      onUpdateResearcher(researcher.id, { customizedLetter: customLetter });
    } catch (error) {
      console.error("Failed to customize letter:", error);
      alert("Failed to generate letter. Please try again.");
    } finally {
      setGeneratingId(null);
    }
  };

  const selectedResearcherForView = favoriteResearchers.find(r => r.id === viewLetterId);

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-8 space-y-6 animate-in fade-in slide-in-from-bottom-4">
      
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
            
            return (
              <div key={researcher.id} className="relative bg-white rounded-2xl p-10 shadow-sm border border-slate-200 hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-[#1D1D1F] leading-tight mb-2">
                      {researcher.name}
                    </h3>
                  </div>
                </div>

                {/* Match Badge - Apple Pill Style (Absolute Position) */}
                {researcher.matchType === MatchType.HIGH && (
                  <div className="absolute top-4 right-4 bg-[#AF52DE]/10 text-[#AF52DE] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#AF52DE]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
                    <Sparkles className="w-3 h-3 fill-current" />
                    High Match
                  </div>
                )}
                {researcher.matchType === MatchType.PARTIAL && (
                  <div className="absolute top-4 right-4 bg-[#34C759]/10 text-[#34C759] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#34C759]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
                    <Sparkles className="w-3 h-3 fill-current" />
                    Partial Match
                  </div>
                )}
                {researcher.matchType === MatchType.LOW && (
                  <div className="absolute top-4 right-4 bg-[#0071E3]/10 text-[#0071E3] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#0071E3]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
                    <Sparkles className="w-3 h-3 fill-current" />
                    Low Match
                  </div>
                )}

                {/* Simplified Keywords */}
                <div className="flex flex-wrap gap-2 mb-6">
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
                <div className="space-y-3">
                  <button
                    onClick={() => handleCustomize(researcher)}
                    disabled={generatingId === researcher.id}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                      hasLetter 
                        ? 'bg-[#E8E8ED] text-[#1D1D1F] hover:bg-[#D2D2D7]' 
                        : 'bg-[#0071E3] text-white hover:bg-[#0077ED] shadow-apple hover:shadow-apple-hover'
                    }`}
                  >
                    {generatingId === researcher.id ? (
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
 
              <div className="px-6 py-4 flex justify-end gap-3">
                 <button
                   onClick={() => {
                     const subject = emailTitle || `Inquiry regarding your research - academic-bioeng-explorer`;
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
                     navigator.clipboard.writeText(selectedResearcherForView.customizedLetter || '');
                   }}
                   className="flex items-center gap-2 px-4 py-2 bg-white/50 border border-black/5 rounded-lg text-sm font-medium hover:bg-white text-slate-700 transition-colors"
                 >
                   <Copy className="w-4 h-4" />
                   Copy to Clipboard
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
