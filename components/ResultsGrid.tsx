import React, { useEffect, useState, useRef } from 'react';
import { Researcher, AnalysisStatus } from '../types';
import { generateScholarSearchUrl, searchScholarAuthorCandidates, ScholarAuthorCandidate } from '../services/serpApiService';
import { ExternalLink, User, BrainCircuit, Tag, Sparkles, Search, Clipboard, Star, RotateCw, X } from 'lucide-react';

interface ResultsGridProps {
  researchers: Researcher[];
  university: string;
  onScholarIdLink: (researcherId: string, scholarId: string) => void;
  onScholarIdSubmit: (researcherId: string, scholarId: string) => void;
  onUpdateResearcher: (id: string, updates: Partial<Researcher>) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteResearcher: (id: string) => void;
}

export const ResultsGrid: React.FC<ResultsGridProps> = ({ 
  researchers, 
  university,
  onScholarIdLink,
  onScholarIdSubmit, 
  onUpdateResearcher,
  onToggleFavorite,
  onDeleteResearcher
}) => {
  if (researchers.length === 0) return null;

  // Sort logic:
  // 1. Processing needed (No Scholar ID) -> TOP
  // 2. Processed (Has Scholar ID) -> BOTTOM
  // 3. Within groups: Perfect > High > Partial > Low > None
  const sortedResearchers = [...researchers].sort((a, b) => {
    // Priority 1: In "All", items needing action must stay at the top:
    // - missing author id / awaiting link
    // - pending (linked but not analyzed)
    const getActionPriority = (r: Researcher) => {
      if (!r.scholarAuthorId || r.status === AnalysisStatus.AWAITING_SCHOLAR_ID) return 0;
      if (r.status === AnalysisStatus.PENDING) return 1;
      return 2;
    };

    const actionA = getActionPriority(a);
    const actionB = getActionPriority(b);
    if (actionA !== actionB) return actionA - actionB;

    // Priority 2: Matches (within same action group)
    // Perfect (100%) > High (>80%) > Partial (3+) > Low (2) > None
    const getMatchScore = (r: Researcher) => {
      if (!r.isMatch) return 0;
      if (r.matchType === 'PERFECT') return 4;
      if (r.matchType === 'HIGH') return 3;
      if (r.matchType === 'PARTIAL') return 2;
      if (r.matchType === 'LOW') return 1;
      return 0.5; // Legacy match without type
    };

    const scoreA = getMatchScore(a);
    const scoreB = getMatchScore(b);

    if (scoreA !== scoreB) return scoreB - scoreA; // Descending score
    
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {sortedResearchers.map((researcher) => (
        <ResearcherCard 
          key={researcher.id} 
          data={researcher} 
          university={university}
          onScholarIdLink={onScholarIdLink}
          onScholarIdSubmit={onScholarIdSubmit}
          onUpdateResearcher={onUpdateResearcher}
          onToggleFavorite={onToggleFavorite}
          onDeleteResearcher={onDeleteResearcher}
        />
      ))}
    </div>
  );
};

// Keyword Tag Component with Smart Tooltip Positioning
const KeywordTag: React.FC<{ tag: any }> = ({ tag }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const tagRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (tagRef.current) {
      const rect = tagRef.current.getBoundingClientRect();
      // If less than 280px (approx tooltip height) from top of viewport, flip it
      if (rect.top < 400) {
        setPosition('bottom');
      } else {
        setPosition('top');
      }
    }
    setShowTooltip(true);
  };

  return (
    <div 
      ref={tagRef}
      className="group relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F5F5F7] text-[#1D1D1F] border border-transparent hover:border-[#D2D2D7] cursor-help transition-all">
        <Tag className="w-3 h-3 mr-1.5 text-[#86868B]" />
        {tag.keyword}
      </span>
      
      {showTooltip && (
        <div className={`
          absolute left-0 z-50 w-72 bg-white/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl ring-1 ring-black/5 p-5 text-left animate-in fade-in duration-200
          ${position === 'top' ? 'bottom-full mb-3 slide-in-from-bottom-2' : 'top-full mt-3 slide-in-from-top-2'}
        `}>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-bold text-[#86868B] uppercase tracking-wide mb-1">Relevance</div>
              <div className="text-sm font-medium text-[#1D1D1F] leading-snug">{tag.reasoning}</div>
            </div>
            
            {tag.supportingPapers && tag.supportingPapers.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-[#86868B] uppercase tracking-wide mb-2 pt-2 border-t border-black/5">Evidence</div>
                <ul className="space-y-2">
                  {tag.supportingPapers.map((paper: any, pIdx: number) => (
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
      )}
    </div>
  );
};

const ResearcherCard: React.FC<{ 
  data: Researcher;
  university: string;
  onScholarIdLink: (researcherId: string, scholarId: string) => void;
  onScholarIdSubmit: (researcherId: string, scholarId: string) => void;
  onUpdateResearcher: (id: string, updates: Partial<Researcher>) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteResearcher: (id: string) => void;
}> = ({ data, university, onScholarIdLink, onScholarIdSubmit, onUpdateResearcher, onToggleFavorite, onDeleteResearcher }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [scholarIdInput, setScholarIdInput] = useState('');
  const [isScholarPopoverOpen, setIsScholarPopoverOpen] = useState(false);
  const [scholarPopoverSide, setScholarPopoverSide] = useState<'left' | 'right'>('right');
  const [isSearchingCandidates, setIsSearchingCandidates] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [authorCandidates, setAuthorCandidates] = useState<ScholarAuthorCandidate[]>([]);
  const [isManualEmailPopoverOpen, setIsManualEmailPopoverOpen] = useState(false);
  const [isManualEmailPopoverVisible, setIsManualEmailPopoverVisible] = useState(false);
  const [manualEmailInput, setManualEmailInput] = useState('');
  const [manualEmailError, setManualEmailError] = useState<string | null>(null);
  const manualEmailHideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (manualEmailHideTimerRef.current !== null) {
        window.clearTimeout(manualEmailHideTimerRef.current);
      }
    };
  }, []);
  
  const isPending = data.status === AnalysisStatus.PENDING;
  const isAwaitingScholarId = data.status === AnalysisStatus.AWAITING_SCHOLAR_ID;
  const isLoading = data.status === AnalysisStatus.LOADING;
  const isError = data.status === AnalysisStatus.ERROR;
  const isCompleted = data.status === AnalysisStatus.COMPLETED;
  const isMatch = isCompleted && data.isMatch;

  const isPerfectMatch = data.matchType === 'PERFECT';
  const isHighMatch = data.matchType === 'HIGH';
  const isPartialMatch = data.matchType === 'PARTIAL';
  const isLowMatch = data.matchType === 'LOW';

  const handleOpenScholar = () => {
    const url = generateScholarSearchUrl(data.name, data.id, university);
    window.location.href = url;
  };

  const handleOpenScholarSearch = () => {
    const query = encodeURIComponent(data.name.trim());
    const url = `https://scholar.google.com/citations?view_op=search_authors&mauthors=${query}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSubmitScholarId = (closeModal = false) => {
    if (scholarIdInput.trim()) {
      onScholarIdLink(data.id, scholarIdInput.trim());
      setScholarIdInput(''); // Clear input after submission
      if (closeModal) setIsScholarPopoverOpen(false);
    }
  };

  const handleOpenScholarPopover = async () => {
    const cardRect = cardRef.current?.getBoundingClientRect();
    if (cardRect) {
      const popoverWidth = 380;
      const rightSpace = window.innerWidth - cardRect.right;
      setScholarPopoverSide(rightSpace >= popoverWidth + 16 ? 'right' : 'left');
    }

    setIsScholarPopoverOpen(true);
    setIsSearchingCandidates(true);
    setCandidateError(null);
    setAuthorCandidates([]);

    try {
      const candidates = await searchScholarAuthorCandidates(data.name, university);
      setAuthorCandidates(candidates);
    } catch (error: any) {
      setCandidateError(error.message || 'Failed to search author candidates.');
    } finally {
      setIsSearchingCandidates(false);
    }
  };

  const handleSelectAuthor = (authorId: string) => {
    onScholarIdLink(data.id, authorId);
    setIsScholarPopoverOpen(false);
  };

  const handleOpenManualEmailPopover = () => {
    if (manualEmailHideTimerRef.current !== null) {
      window.clearTimeout(manualEmailHideTimerRef.current);
      manualEmailHideTimerRef.current = null;
    }
    setManualEmailInput('');
    setManualEmailError(null);
    setIsManualEmailPopoverOpen(true);
    setIsManualEmailPopoverVisible(false);
    window.requestAnimationFrame(() => {
      setIsManualEmailPopoverVisible(true);
    });
  };

  const handleCloseManualEmailPopover = (immediate = false) => {
    if (!isManualEmailPopoverOpen) return;
    if (manualEmailHideTimerRef.current !== null) {
      window.clearTimeout(manualEmailHideTimerRef.current);
      manualEmailHideTimerRef.current = null;
    }

    setIsManualEmailPopoverVisible(false);
    if (immediate) {
      setIsManualEmailPopoverOpen(false);
      return;
    }

    manualEmailHideTimerRef.current = window.setTimeout(() => {
      setIsManualEmailPopoverOpen(false);
      manualEmailHideTimerRef.current = null;
    }, 160);
  };

  const handleSaveManualEmail = () => {
    const trimmed = manualEmailInput.trim().toLowerCase();
    const emailPattern = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
    if (!emailPattern.test(trimmed)) {
      setManualEmailError('Please enter a valid email.');
      return;
    }

    onUpdateResearcher(data.id, { contactEmail: trimmed });
    handleCloseManualEmailPopover();
    setManualEmailInput('');
    setManualEmailError(null);
  };

  return (
    <div
      ref={cardRef}
      className={`
      relative flex flex-col h-full bg-white rounded-[24px] transition-all duration-300
      ${isLoading ? 'ring-2 ring-[#0071E3] shadow-apple-hover scale-[1.01]' : 'border border-black/5 hover:border-[#D2D2D7] shadow-apple hover:shadow-apple-hover'}
      ${isError ? 'border-red-200' : ''}
    `}
    >
      {/* Favorite Star - Bottom Left */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(data.id);
        }}
        className={`absolute bottom-5 left-5 p-2 rounded-full transition-all active:scale-95 z-20 ${data.isFavorite ? 'bg-yellow-400/20 text-yellow-500 shadow-sm' : 'bg-[#F5F5F7] text-[#D2D2D7] hover:text-[#86868B]'}`}
        title={data.isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Star className={`w-5 h-5 ${data.isFavorite ? 'fill-yellow-500' : ''}`} />
      </button>

      {/* Match Badge - Apple Pill Style */}
      {isPerfectMatch && (
        <div className="absolute top-6 right-12 bg-[#FFD60A]/15 text-[#B8860B] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#FFD60A]/40 flex items-center gap-1 z-10 backdrop-blur-sm">
          <Sparkles className="w-3 h-3 fill-current" />
          Perfect Match
        </div>
      )}
      {isHighMatch && (
        <div className="absolute top-6 right-12 bg-[#AF52DE]/10 text-[#AF52DE] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#AF52DE]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
          <Sparkles className="w-3 h-3 fill-current" />
          High Match
        </div>
      )}
      {isPartialMatch && (
        <div className="absolute top-6 right-12 bg-[#34C759]/10 text-[#34C759] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#34C759]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
          <Sparkles className="w-3 h-3 fill-current" />
          Partial Match
        </div>
      )}
      {isLowMatch && (
        <div className="absolute top-6 right-12 bg-[#0071E3]/10 text-[#0071E3] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-[#0071E3]/20 flex items-center gap-1 z-10 backdrop-blur-sm">
          <Sparkles className="w-3 h-3 fill-current" />
          Low Match
        </div>
      )}

      {/* Delete Button - Top Right */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDeleteResearcher(data.id);
        }}
        className="absolute top-4 right-4 p-1 rounded-full text-[#86868B] hover:bg-red-50 hover:text-red-500 transition-all z-20"
        title="Delete card"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="p-6 pb-4 flex items-start justify-between gap-4 rounded-t-[24px]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-[#F5F5F7] text-[#86868B] overflow-hidden border border-black/5">
             {data.avatarUrl ? (
               <img 
                 src={data.avatarUrl} 
                 alt={data.name} 
                 className="w-full h-full object-cover shadow-inner"
               />
             ) : (
               <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#F5F5F7] to-[#E8E8ED] text-[#86868B] text-lg font-bold">
                 {data.name[0]}
               </div>
             )}
          </div>
          <div className="pt-0.5 relative">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center h-5 text-[10px] font-bold uppercase tracking-wider px-2.5 rounded-full ${getStatusColor(data.status)}`}>
                {getStatusLabel(data.status)}
              </span>
            </div>
            {data.homepageUrl ? (
              <a
                href={data.homepageUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="mt-1.5 block font-bold text-[#1D1D1F] text-lg leading-tight line-clamp-2 tracking-tight hover:underline"
              >
                {data.name}
              </a>
            ) : (
              <h4 className="mt-1.5 font-bold text-[#1D1D1F] text-lg leading-tight line-clamp-2 tracking-tight">{data.name}</h4>
            )}
            {data.contactEmail ? (
              <a
                href={`mailto:${data.contactEmail}`}
                onClick={(event) => event.stopPropagation()}
                className="mt-1.5 inline-flex text-xs text-[#0071E3] hover:underline break-all"
              >
                {data.contactEmail}
              </a>
            ) : (
              isCompleted && (
                <div className="mt-1.5 flex items-center gap-2">
                  <p className="text-xs text-[#86868B]">No homepage email found</p>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isManualEmailPopoverOpen) {
                        handleCloseManualEmailPopover();
                      } else {
                        handleOpenManualEmailPopover();
                      }
                    }}
                    className="px-1.5 py-0.5 text-[#0071E3] text-base font-semibold leading-none hover:text-[#0077ED] transition-colors"
                    title="Add email manually"
                  >
                    +
                  </button>
                </div>
              )
            )}
            {isManualEmailPopoverOpen && (
              <div
                onClick={(event) => event.stopPropagation()}
                onMouseLeave={() => handleCloseManualEmailPopover()}
                className={`absolute left-0 top-full mt-2 z-30 w-64 rounded-xl border border-black/10 bg-white shadow-lg p-3 space-y-2 transition-all duration-150 ${
                  isManualEmailPopoverVisible
                    ? 'opacity-100 scale-100 translate-y-0'
                    : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
                }`}
              >
                <p className="text-[11px] font-semibold text-[#1D1D1F]">Add Email</p>
                <input
                  type="email"
                  value={manualEmailInput}
                  onChange={(event) => {
                    setManualEmailInput(event.target.value);
                    setManualEmailError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleSaveManualEmail();
                    }
                  }}
                  placeholder="name@university.edu"
                  className="w-full h-8 px-2.5 text-xs bg-[#F5F5F7] border border-black/10 rounded-lg focus:ring-2 focus:ring-[#0071E3]/30 focus:outline-none"
                />
                {manualEmailError && (
                  <p className="text-[11px] text-red-500">{manualEmailError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      handleCloseManualEmailPopover();
                      setManualEmailInput('');
                      setManualEmailError(null);
                    }}
                    className="px-2.5 py-1 text-[11px] rounded-md border border-black/10 text-[#86868B] hover:bg-[#F5F5F7]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveManualEmail}
                    className="px-2.5 py-1 text-[11px] rounded-md bg-[#0071E3] text-white hover:bg-[#0077ED]"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

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
             <button
               onClick={handleOpenScholarPopover}
               className="w-full h-11 flex items-center justify-center gap-2 bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow-md active:scale-95"
             >
               <Search className="w-4 h-4" />
               Link Google Scholar
             </button>

             <p className="text-[11px] text-[#86868B] leading-relaxed">
               Searches top Scholar profile candidates using name
               {university.trim() ? ` + ${university.trim()}` : ''}.
               You can still use plugin or paste Author ID manually in the side panel.
             </p>
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
                <KeywordTag key={idx} tag={tag} />
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

      {isScholarPopoverOpen && (
        <div
          onMouseLeave={() => setIsScholarPopoverOpen(false)}
          className={`absolute top-24 z-[120] w-[380px] max-h-[70vh] overflow-hidden bg-white/90 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${
            scholarPopoverSide === 'right' ? 'left-full ml-3' : 'right-full mr-3'
          }`}
        >
          <div className="px-4 py-3 flex items-center justify-between border-b border-black/5">
            <div>
              <h3 className="font-semibold text-[#1D1D1F] text-sm">Scholar Candidates</h3>
              <p className="text-[11px] text-[#86868B] mt-0.5">
                {data.name}{university.trim() ? ` + ${university.trim()}` : ''}
              </p>
            </div>
            <button
              onClick={() => setIsScholarPopoverOpen(false)}
              className="p-1.5 rounded-full hover:bg-black/5 text-slate-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[42vh] space-y-3">
            {isSearchingCandidates && (
              <div className="text-sm text-[#86868B]">Searching Scholar candidates...</div>
            )}

            {!isSearchingCandidates && candidateError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
                {candidateError}
              </div>
            )}

            {!isSearchingCandidates && !candidateError && authorCandidates.length === 0 && (
              <div className="text-sm text-[#86868B] bg-[#F5F5F7] rounded-xl p-3 border border-black/5">
                No candidate profiles found from API.
              </div>
            )}

            {!isSearchingCandidates && authorCandidates.length > 0 && (
              <div className="space-y-3">
                {authorCandidates.map((author) => (
                  <div key={author.authorId} className="rounded-xl border border-black/5 bg-white/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <h4 className="font-semibold text-[#1D1D1F] text-sm truncate">{author.name}</h4>
                        {author.affiliations && (
                          <p className="text-xs text-[#424245] line-clamp-2">{author.affiliations}</p>
                        )}
                        {author.email && (
                          <p className="text-xs text-[#86868B]">{author.email}</p>
                        )}
                        <p className="text-[11px] text-[#86868B]">Author ID: {author.authorId}</p>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        {author.link && (
                          <a
                            href={author.link}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg border border-black/10 bg-white/70 text-[#0071E3] hover:bg-white transition-colors"
                            title="Open Scholar profile"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => handleSelectAuthor(author.authorId)}
                          className="px-2.5 py-1.5 bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-lg text-[11px] font-semibold transition-colors"
                        >
                          Link
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-black/5 space-y-2.5 bg-white/40">
            <div className="flex gap-2">
              <input
                type="text"
                value={scholarIdInput}
                onChange={(e) => setScholarIdInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitScholarId(true)}
                placeholder="Paste Author ID"
                className="flex-1 h-9 px-3 text-sm bg-[#F5F5F7] border border-black/5 rounded-lg focus:ring-2 focus:ring-[#0071E3] placeholder:text-[#86868B]/70"
              />
              <button
                onClick={() => handleSubmitScholarId(true)}
                disabled={!scholarIdInput.trim()}
                className="px-3 h-9 bg-black text-white rounded-lg text-sm font-medium hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Link ID
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenScholar}
                  className="px-3 py-1.5 bg-white border border-black/5 rounded-lg text-xs font-medium hover:bg-[#F5F5F7] text-[#1D1D1F] transition-colors"
                >
                  Open Plugin Search
                </button>
                <button
                  onClick={handleOpenScholarSearch}
                  className="px-3 py-1.5 bg-white border border-black/5 rounded-lg text-xs font-medium hover:bg-[#F5F5F7] text-[#1D1D1F] transition-colors"
                >
                  Open Scholar
                </button>
              </div>
              <button
                onClick={handleOpenScholarPopover}
                className="px-3 py-1.5 bg-black/5 border border-black/5 rounded-lg text-xs font-medium hover:bg-black/10 text-slate-700 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}
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
