import React from 'react';
import { FileText, Download, Wand2, Sparkles } from 'lucide-react';

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
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-500 ${hasResults ? 'opacity-90' : ''}`}>
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Setup & Data Input
        </h3>
        {!hasResults && (
           <span className="text-xs text-slate-500 bg-slate-200 px-2 py-1 rounded">Step 1</span>
        )}
      </div>
      
      <div className="p-6 space-y-6">
        {/* User Interests for Matching */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-emerald-600 uppercase tracking-wide flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Your Research Interests
          </label>
          <input 
            type="text" 
            value={userInterests}
            onChange={(e) => setUserInterests(e.target.value)}
            placeholder="e.g. Medical Imaging, Synthetic Biology, Machine Learning"
            className="w-full p-2.5 border border-emerald-200 bg-emerald-50/30 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400"
          />
          <p className="text-[10px] text-slate-400">
            Keywords will be filtered to show only topics matching your interests.
          </p>
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
             Staff List Content
          </label>
          <textarea
            className="w-full h-32 p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-imperial-accent focus:border-transparent outline-none font-mono text-sm resize-y text-slate-700 placeholder:text-slate-400"
            placeholder="Paste the content from the staff directory page here...&#10;(e.g., 'Professor John Doe, Chair in Biomechanics...')"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
        </div>
        
        <div className="flex justify-end">
          <button
            onClick={onExtract}
            disabled={!rawText.trim() || isExtracting}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
              !rawText.trim() || isExtracting
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-imperial-accent hover:bg-imperial-blue text-white'
            }`}
          >
            {isExtracting ? (
              <>
                <Wand2 className="w-4 h-4 animate-spin" />
                Extracting Names...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Extract Names
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};