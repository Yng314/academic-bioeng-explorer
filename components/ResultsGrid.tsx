import React, { useState, useRef } from 'react';
import { Researcher, AnalysisStatus } from '../types';
import { generateScholarSearchUrl } from '../services/serpApiService';
import { ExternalLink, User, BrainCircuit, Tag, Sparkles, Search, Clipboard, Star, RotateCw } from 'lucide-react';

interface ResultsGridProps {
  researchers: Researcher[];
  onScholarIdSubmit: (researcherId: string, scholarId: string) => void;
  onToggleFavorite: (id: string) => void;
}

export const ResultsGrid: React.FC<ResultsGridProps> = ({ researchers, onScholarIdSubmit, onToggleFavorite }) => {
  if (researchers.length === 0) return null;

  // Sort logic:
  // 1. Processing needed (No Scholar ID) -> TOP
  // 2. Processed (Has Scholar ID) -> BOTTOM
  // 3. Within groups: High Match > Partial Match > No Match
  const sortedResearchers = [...researchers].sort((a, b) => {
    // Priority 1: Favorites always at very top
    // Priority 1: Favorites always at very top
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;

    // Priority 2: Status (Show "Awaiting ID" first, "Completed/Ready" last)
    const aHasId = !!a.scholarAuthorId;
    const bHasId = !!b.scholarAuthorId;
    
    if (aHasId !== bHasId) {
      return aHasId ? 1 : -1; // If a has ID, it goes to bottom (1)
    }

    // Priority 3: Matches (within same group)
    // High (>80%) > Partial (3+) > Low (2) > None
    const getMatchScore = (r: Researcher) => {
      if (!r.isMatch) return 0;
      if (r.matchType === 'HIGH') return 3;
      if (r.matchType === 'PARTIAL') return 2;
      if (r.matchType === 'LOW') return 1;
      return 0.5; // Legacy match without type
    };

    const scoreA = getMatchScore(a);
    const scoreB = getMatchScore(b);

    if (scoreA !== scoreB) return scoreB - scoreA; // Descending score
    
    return 0;
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {sortedResearchers.map((researcher) => (
        <ResearcherCard 
          key={researcher.id} 
          data={researcher} 
          onScholarIdSubmit={onScholarIdSubmit}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
};

const ResearcherCard: React.FC<{ 
  data: Researcher;
  onScholarIdSubmit: (researcherId: string, scholarId: string) => void;
  onToggleFavorite: (id: string) => void;
}> = ({ data, onScholarIdSubmit, onToggleFavorite }) => {
  const [scholarIdInput, setScholarIdInput] = useState('');
  
  const isPending = data.status === AnalysisStatus.PENDING;
  const isAwaitingScholarId = data.status === AnalysisStatus.AWAITING_SCHOLAR_ID;
  const isLoading = data.status === AnalysisStatus.LOADING;
  const isError = data.status === AnalysisStatus.ERROR;
  const isCompleted = data.status === AnalysisStatus.COMPLETED;
  const isMatch = isCompleted && data.isMatch;

  const isHighMatch = data.matchType === 'HIGH';
  const isPartialMatch = data.matchType === 'PARTIAL';
  const isLowMatch = data.matchType === 'LOW';

  // Store reference to Scholar window to reuse it
  const scholarWindowRef = useRef<Window | null>(null);

  const handleOpenScholar = () => {
    const url = generateScholarSearchUrl(data.name, data.id);
    
    // Check if Scholar window is still open
    if (scholarWindowRef.current && !scholarWindowRef.current.closed) {
      // Reuse existing window
      scholarWindowRef.current.location.href = url;
      scholarWindowRef.current.focus();
      console.log('[ResultsGrid] Reusing existing Scholar window');
    } else {
      // Open new window and save reference
      scholarWindowRef.current = window.open(url, 'scholarWindow');
      console.log('[ResultsGrid] Opened new Scholar window');
    }
  };

  const handleSubmitScholarId = () => {
    if (scholarIdInput.trim()) {
      onScholarIdSubmit(data.id, scholarIdInput.trim());
      setScholarIdInput(''); // Clear input after submission
    }
  };

  return (
    <div className={`
      relative flex flex-col h-full bg-white rounded-[24px] transition-all duration-300
      ${isLoading ? 'ring-2 ring-[#0071E3] shadow-apple-hover scale-[1.01]' : 'border border-black/5 hover:border-[#D2D2D7] shadow-apple hover:shadow-apple-hover'}
      ${isError ? 'border-red-200' : ''}
    `}>
      {/* Match Badge - Apple Pill Style */}
      {isHighMatch && (
        <div className="absolute top-4 right-4 bg-[#AF52DE]/10 text-[#AF52DE] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#AF52DE]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
          <Sparkles className="w-3 h-3 fill-current" />
          High Match
        </div>
      )}
      {isPartialMatch && (
        <div className="absolute top-4 right-4 bg-[#34C759]/10 text-[#34C759] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#34C759]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
          <Sparkles className="w-3 h-3 fill-current" />
          Partial Match
        </div>
      )}
      {isLowMatch && (
        <div className="absolute top-4 right-4 bg-[#0071E3]/10 text-[#0071E3] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#0071E3]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
          <Sparkles className="w-3 h-3 fill-current" />
          Low Match
        </div>
      )}

      {/* Header */}
      <div className="p-6 pb-4 flex items-start justify-between gap-4 rounded-t-[24px]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-[#F5F5F7] text-[#86868B]">
             <User className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-[#1D1D1F] text-lg leading-tight line-clamp-2 tracking-tight">{data.name}</h4>
            <div className="flex items-center gap-2 mt-1.5">
               <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${getStatusColor(data.status)}`}>
                 {getStatusLabel(data.status)}
               </span>
            </div>
          </div>
        </div>

        {/* Favorite Button - Floating */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(data.id);
          }}
          className={`mt-8 p-2 rounded-full transition-all active:scale-95 ${data.isFavorite ? 'bg-yellow-400/20 text-yellow-500' : 'bg-[#F5F5F7] text-[#D2D2D7] hover:text-[#86868B]'}`}
          title={data.isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={`w-5 h-5 ${data.isFavorite ? 'fill-yellow-500' : ''}`} />
        </button>
      </div>

      {/* Body */}
      <div className="px-6 pb-6 flex-grow flex flex-col gap-5">
        
        {/* PENDING: Ready to Analyze */}
        {isPending && (
          <div className="bg-[#E8F8F0] border border-[#34C759]/30 rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2">
             <div className="w-8 h-8 rounded-full bg-[#34C759] flex items-center justify-center text-white mb-1 shadow-sm">
                <Sparkles className="w-4 h-4" />
             </div>
             <p className="text-[#34C759] font-bold text-sm">Author ID Verified</p>
             <p className="text-[#34C759]/80 text-xs">Ready for batch analysis</p>
          </div>
        )}

        {/* AWAITING_SCHOLAR_ID */}
        {isAwaitingScholarId && (
          <div className="flex flex-col gap-3">
             <div className="text-sm text-[#86868B] text-center bg-[#F5F5F7] rounded-xl p-4">
                 Step 1: Link Scholar Profile
             </div>
             <button
               onClick={handleOpenScholar}
               className="w-full h-10 flex items-center justify-center gap-2 bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow-md active:scale-95"
             >
               <Search className="w-4 h-4" />
               Find on Google Scholar
             </button>
             
             <div className="relative pt-2">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-[#D2D2D7]/50"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-2 text-[10px] text-[#86868B] uppercase tracking-wide">Or paste ID</span>
                </div>
             </div>

             <div className="flex gap-2">
                 <input
                   type="text"
                   value={scholarIdInput}
                   onChange={(e) => setScholarIdInput(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleSubmitScholarId()}
                   placeholder="e.g. LSsXyncAAAAJ"
                   className="flex-1 h-9 px-3 text-sm bg-[#F5F5F7] border-0 rounded-lg focus:ring-2 focus:ring-[#0071E3] placeholder:text-[#86868B]/70"
                 />
                 <button
                   onClick={handleSubmitScholarId}
                   disabled={!scholarIdInput.trim()}
                   className="px-3 h-9 bg-black text-white rounded-lg text-sm font-medium hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                 >
                   Save
                 </button>
             </div>
          </div>
        )}

        {/* LOADING */}
        {isLoading && (
          <div className="space-y-4 py-4 animate-pulse">
            <div className="flex gap-3">
              <div className="w-1 h-12 bg-[#F5F5F7] rounded-full"></div>
              <div className="flex-1 space-y-2">
                 <div className="h-4 bg-[#F5F5F7] rounded w-3/4"></div>
                 <div className="h-4 bg-[#F5F5F7] rounded w-full"></div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="h-6 bg-[#F5F5F7] rounded-md w-16"></div>
              <div className="h-6 bg-[#F5F5F7] rounded-md w-12"></div>
              <div className="h-6 bg-[#F5F5F7] rounded-md w-20"></div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {isError && (
          <div className="flex flex-col items-center justify-center p-6 bg-[#FFF2F2] rounded-2xl border border-red-100 text-center">
            <p className="text-red-500 font-semibold text-sm mb-1">Analysis Failed</p>
            <p className="text-red-400 text-xs mb-3">Could not fetch publications</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (data.scholarAuthorId) {
                   onScholarIdSubmit(data.id, data.scholarAuthorId);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white text-red-500 text-xs font-bold rounded-full shadow-sm hover:shadow-md transition-all"
            >
              <RotateCw className="w-3 h-3" />
              Try Again
            </button>
          </div>
        )}

        {/* COMPLETED: RESULTS */}
        {isCompleted && (
          <div className="flex flex-col h-full">
            {/* Match Reason Module - Minimal Style */}
            {data.matchReason && (
               <div className="text-sm leading-relaxed mb-4 text-[#1D1D1F] font-medium">
                 {data.matchReason}
               </div>
            )}

            {/* Keywords / Tags */}
            <div className="flex flex-wrap gap-2 content-start">
              {data.tags?.map((tag, idx) => (
                <div key={idx} className="group relative inline-block">
                  <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F5F5F7] text-[#1D1D1F] border border-transparent hover:border-[#D2D2D7] cursor-help transition-all">
                    <Tag className="w-3 h-3 mr-1.5 text-[#86868B]" />
                    {tag.keyword}
                  </span>
                  
                  {/* Apple Popover Tooltip */}
                  <div className="absolute bottom-full left-0 mb-3 hidden group-hover:block z-50 w-72 bg-white/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl ring-1 ring-black/5 p-5 text-left animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] font-bold text-[#86868B] uppercase tracking-wide mb-1">Relevance</div>
                        <div className="text-sm font-medium text-[#1D1D1F] leading-snug">{tag.reasoning}</div>
                      </div>
                      
                      {tag.supportingPapers && tag.supportingPapers.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-[#86868B] uppercase tracking-wide mb-2 pt-2 border-t border-black/5">Evidence</div>
                          <ul className="space-y-2">
                            {tag.supportingPapers.map((paper, pIdx) => (
                              <li key={pIdx} className="text-[10px] text-[#424245] leading-snug pl-2 border-l-2 border-[#0071E3]/50">
                                <span className="font-semibold text-[#1D1D1F] block mb-0.5">{paper.title}</span>
                                {paper.year} · {paper.citations} citations
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Actions */}
            {data.profileUrl && (
              <div className="mt-auto pt-6 flex justify-end">
                <a 
                  href={data.profileUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="group flex items-center gap-1.5 text-xs font-semibold text-[#0071E3]/50 hover:text-[#0071E3] transition-colors"
                >
                  View Scholar Profile 
                  <ExternalLink className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Helpers
// Helpers
function getStatusColor(status: AnalysisStatus) {
  switch (status) {
    case AnalysisStatus.PENDING: return 'bg-[#34C759]/10 text-[#34C759]';
    case AnalysisStatus.AWAITING_SCHOLAR_ID: return 'bg-[#FF9500]/10 text-[#FF9500]';
    case AnalysisStatus.LOADING: return 'bg-[#0071E3]/10 text-[#0071E3]';
    case AnalysisStatus.COMPLETED: return 'bg-[#86868B]/10 text-[#86868B]';
    case AnalysisStatus.ERROR: return 'bg-[#FF3B30]/10 text-[#FF3B30]';
    default: return 'bg-[#E8E8ED] text-[#86868B]';
  }
}

function getStatusLabel(status: AnalysisStatus) {
  switch (status) {
    case AnalysisStatus.PENDING: return 'Ready To Analyze';
    case AnalysisStatus.AWAITING_SCHOLAR_ID: return 'Needs ID';
    case AnalysisStatus.LOADING: return 'Analyzing';
    case AnalysisStatus.COMPLETED: return 'Analyzed';
    case AnalysisStatus.ERROR: return 'Failed';
  }
}