import React, { useState, useEffect } from 'react';
import { FileText, Download, Wand2, ChevronDown } from 'lucide-react';

interface ProfessorSearchSectionProps {
  rawText: string;
  setRawText: (text: string) => void;
  onExtract: () => void;
  isExtracting: boolean;
  hasResults: boolean;
}

export const ProfessorSearchSection: React.FC<ProfessorSearchSectionProps> = ({ 
  rawText, 
  setRawText,
  onExtract,
  isExtracting,
  hasResults
}) => {
  // Initialize expanded state based on whether there are results
  // If no results or no text, expand by default. 
  // If there are results, start collapsed to avoid animation glitch.
  const [isExpanded, setIsExpanded] = useState(() => {
    return !hasResults || !rawText.trim();
  });

  // Auto-collapse when results appear for the first time
  useEffect(() => {
    if (hasResults && rawText.trim().length > 0) {
      setIsExpanded(false);
    }
  }, [hasResults]);

  return (
    <div className="w-full bg-[#FAFAFA]/30 backdrop-blur-md border-b border-black/5 transition-all duration-300">
      <div className="max-w-7xl mx-auto">
         <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? '' : ''}`}>
           {/* Header - Always Visible (Toggle) */}
           <button 
             onClick={() => setIsExpanded(!isExpanded)}
             className="w-full px-6 py-4 flex items-center justify-between group outline-none transition-colors"
           >
             <div className="space-y-1 text-left">
                <h3 className="text-l font-semibold tracking-tight text-[#1D1D1F]">
                   Extract Professor Names
                </h3>
                <p className={`text-sm text-[#86868B] transition-opacity duration-300 ${!isExpanded ? 'opacity-0 h-0 hidden' : 'opacity-100'}`}>
                   Paste your list of professors below to start analyzing.
                </p>
             </div>

             <div className="flex items-center gap-4">
               {/* Extract Button (Visible if collapsed and has text) */}
               {!isExpanded && rawText.trim() && (
                 <div onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={onExtract}
                      disabled={isExtracting}
                      className="flex items-center gap-2 px-4 py-2 bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-full text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isExtracting ? <Wand2 className="w-3 h-3 animate-spin"/> : <Download className="w-3 h-3"/>}
                      Extract Name
                    </button>
                 </div>
               )}

               <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                  <ChevronDown className="w-5 h-5 text-[#86868B] group-hover:text-[#1D1D1F]" />
               </div>
             </div>
           </button>

           {/* Collapsible Content */}
           <div 
             className={`transition-[max-height,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden ${
               isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
             }`}
           >
             <div className="px-6 pb-6 pt-2 space-y-6">
                
                <div className="relative group">
                   <div className="mb-2 text-xs font-semibold text-[#86868B] uppercase tracking-wider flex items-center gap-2">
                       <FileText className="w-3 h-3 text-[#0071E3]" />
                       Professor Name List
                   </div>
                   <textarea
                     className="w-full h-32 p-4 text-sm font-mono leading-relaxed border border-[#D2D2D7] rounded-xl focus:ring-4 focus:ring-[#0071E3]/20 focus:border-[#0071E3] outline-none resize-y text-[#1D1D1F] placeholder:text-[#86868B] transition-all shadow-sm bg-white"
                     placeholder="Paste content here to extract names...&#10;e.g. 'Professor John Doe, Chair in Biomechanics...'"
                     value={rawText}
                     onChange={(e) => setRawText(e.target.value)}
                   />
                   <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <span className="text-[10px] text-[#86868B] bg-[#F5F5F7] px-2 py-1 rounded-md border border-[#D2D2D7]/50">Cmd+V to paste</span>
                   </div>
                </div>

                {/* Independent Extract Button (Only in Expanded) - Moved to Bottom */}
                <div className="flex justify-end">
                   <button
                      onClick={() => {
                        onExtract();
                        if (rawText.trim()) setIsExpanded(false);
                      }}
                      disabled={!rawText.trim() || isExtracting}
                      className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm transition-all transform active:scale-95 ${
                        !rawText.trim() || isExtracting
                          ? 'bg-[#E8E8ED] text-[#86868B] cursor-not-allowed'
                          : 'bg-[#0071E3] hover:bg-[#0077ED] text-white shadow-apple hover:shadow-apple-hover'
                      }`}
                    >
                      {isExtracting ? (
                        <>
                          <Wand2 className="w-4 h-4 animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Extract Name
                        </>
                      )}
                    </button>
                </div>
             </div>
           </div>
         </div>
      </div>
    </div>
  );
};
