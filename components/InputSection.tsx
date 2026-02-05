import React, { useState, useEffect } from 'react';
import { FileText, Download, Wand2, Sparkles, ChevronDown, ChevronUp, Settings } from 'lucide-react';

interface InputSectionProps {
  userInterests: string;
  setUserInterests: (s: string) => void;
  rawText: string;
  setRawText: (text: string) => void;
  onExtract: () => void;
  isExtracting: boolean;
  hasResults: boolean;
}

export const InputSection: React.FC<InputSectionProps> = ({ 
  userInterests,
  setUserInterests,
  rawText, 
  setRawText, 
  onExtract, 
  isExtracting,
  hasResults
}) => {
  // Auto-collapse if there are results, otherwise keep open
  // If userInterests are empty, force open
  const [isExpanded, setIsExpanded] = useState(true);

  // Auto-collapse when results appear for the first time
  useEffect(() => {
    if (hasResults && userInterests.trim().length > 0) {
      setIsExpanded(false);
    }
  }, [hasResults]); // Only run when hasResults changes

  return (
    <div className="w-full bg-[#F5F5F7]/85 backdrop-blur-xl border-b border-black/5 transition-all duration-300">
      <div className="max-w-7xl mx-auto">
        <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? '' : ''}`}>
          {/* Header - Always Visible */}
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full text-left px-6 py-4 hover:bg-[#000000]/[0.02] transition-colors flex justify-between items-center group outline-none"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full transition-colors ${isExpanded ? 'bg-[#0071E3] text-white' : 'bg-[#E8E8ED] text-[#86868B] group-hover:text-[#0071E3] group-hover:bg-[#0071E3]/10'}`}>
                <Settings className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <h3 className={`font-semibold tracking-tight transition-colors ${isExpanded ? 'text-[#1D1D1F]' : 'text-[#6e6e73] group-hover:text-[#1D1D1F]'}`}>
                  My Interests and Professors' Name List
                </h3>
                {!isExpanded && (
                  <p className="text-xs text-[#86868B] truncate max-w-[300px]">
                    {userInterests ? `Interests: ${userInterests}` : 'Click to configure interests'}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {!isExpanded && !hasResults && (
                <span className="text-xs text-white bg-[#0071E3] px-2.5 py-1 rounded-full animate-pulse shadow-sm">
                  Start Here
                </span>
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
            <div className="px-6 pb-6 pt-2 space-y-8">
              {/* User Interests for Matching */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-[#86868B] uppercase tracking-wider flex items-center gap-2 mb-1 pl-1">
                  <Sparkles className="w-3 h-3 text-[#0071E3]" /> 
                  Your Research Interests
                </label>
                <input 
                  type="text" 
                  value={userInterests}
                  onChange={(e) => setUserInterests(e.target.value)}
                  placeholder="e.g. Medical Imaging, Synthetic Biology, Machine Learning"
                  className="w-full text-base p-4 border border-[#D2D2D7] bg-white rounded-xl focus:ring-4 focus:ring-[#0071E3]/20 focus:border-[#0071E3] outline-none text-[#1D1D1F] placeholder:text-[#86868B] transition-all shadow-sm"
                />
                <p className="text-[11px] text-[#86868B] flex justify-between px-1">
                  <span>Keywords used for Semantic Matching (80% match = High)</span>
                  <span className={userInterests.length > 0 ? "text-[#0071E3] font-medium" : ""}>{userInterests.split(',').filter(s => s.trim()).length} topics detected</span>
                </p>
              </div>
    
              <div className="space-y-3">
                <label className="text-xs font-semibold text-[#86868B] uppercase tracking-wider flex items-center gap-2 mb-1 pl-1">
                   <FileText className="w-3 h-3 text-[#0071E3]" />
                   Raw Staff List
                </label>
                <div className="relative group">
                  <textarea
                    className="w-full h-32 p-4 text-sm font-mono leading-relaxed border border-[#D2D2D7] rounded-xl focus:ring-4 focus:ring-[#0071E3]/20 focus:border-[#0071E3] outline-none resize-y text-[#1D1D1F] placeholder:text-[#86868B] transition-all shadow-sm"
                    placeholder="Paste content here to extract names...&#10;e.g. 'Professor John Doe, Chair in Biomechanics...'"
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                  />
                  <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                     <span className="text-[10px] text-[#86868B] bg-[#F5F5F7] px-2 py-1 rounded-md border border-[#D2D2D7]/50">Cmd+V to paste</span>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end pt-4 border-t border-[#000000]/[0.05]">
                <button
                  onClick={() => {
                    onExtract();
                    // Optional: Collapse after extraction starts
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
                      Extract Names & Analyze
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