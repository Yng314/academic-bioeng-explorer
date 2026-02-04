import React, { useState } from 'react';
import { Researcher, AnalysisStatus } from '../types';
import { ExternalLink, User, BrainCircuit, Tag, Sparkles, Search, Clipboard } from 'lucide-react';

interface ResultsGridProps {
  researchers: Researcher[];
  onScholarIdSubmit: (researcherId: string, scholarId: string) => void;
}

export const ResultsGrid: React.FC<ResultsGridProps> = ({ researchers, onScholarIdSubmit }) => {
  if (researchers.length === 0) return null;

  // Sort matches to the top once completed
  const sortedResearchers = [...researchers].sort((a, b) => {
    if (a.isMatch && !b.isMatch) return -1;
    if (!a.isMatch && b.isMatch) return 1;
    return 0;
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {sortedResearchers.map((researcher) => (
        <ResearcherCard 
          key={researcher.id} 
          data={researcher} 
          onScholarIdSubmit={onScholarIdSubmit}
        />
      ))}
    </div>
  );
};

const ResearcherCard: React.FC<{ 
  data: Researcher;
  onScholarIdSubmit: (researcherId: string, scholarId: string) => void;
}> = ({ data, onScholarIdSubmit }) => {
  const [scholarIdInput, setScholarIdInput] = useState('');
  
  const isPending = data.status === AnalysisStatus.PENDING;
  const isAwaitingScholarId = data.status === AnalysisStatus.AWAITING_SCHOLAR_ID;
  const isLoading = data.status === AnalysisStatus.LOADING;
  const isError = data.status === AnalysisStatus.ERROR;
  const isCompleted = data.status === AnalysisStatus.COMPLETED;
  const isMatch = isCompleted && data.isMatch;

  const handleOpenScholar = () => {
    const url = `https://scholar.google.com/scholar?hl=en&q=${encodeURIComponent(data.name)}`;
    window.open(url, '_blank');
  };

  const handleSubmitScholarId = () => {
    if (scholarIdInput.trim()) {
      onScholarIdSubmit(data.id, scholarIdInput.trim());
      setScholarIdInput(''); // Clear input after submission
    }
  };

  return (
    <div className={`
      relative flex flex-col h-full bg-white rounded-xl shadow-sm border transition-all duration-300
      ${isLoading ? 'border-imperial-accent ring-1 ring-imperial-accent shadow-md scale-[1.01]' : ''}
      ${isMatch ? 'border-amber-400 ring-1 ring-amber-400 shadow-md' : 'border-slate-200 hover:shadow-md'}
      ${isError ? 'border-red-200' : ''}
    `}>
      {/* Match Badge */}
      {isMatch && (
        <div className="absolute -top-3 -right-2 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200 shadow-sm flex items-center gap-1 z-10">
          <Sparkles className="w-3 h-3 fill-amber-500 text-amber-500" />
          Smart Match
        </div>
      )}

      {/* Header */}
      <div className={`p-5 border-b flex items-start justify-between gap-4 ${isMatch ? 'bg-amber-50/30 border-amber-100' : 'border-slate-100'}`}>
        <div className="flex items-center gap-3">
          <div className={`
            w-10 h-10 rounded-full flex items-center justify-center shrink-0
            ${isMatch ? 'bg-amber-100 text-amber-600' : isCompleted ? 'bg-imperial-light text-imperial-blue' : 'bg-slate-100 text-slate-400'}
          `}>
            <User className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 leading-tight line-clamp-2">{data.name}</h4>
            <div className="flex items-center gap-2 mt-1">
               <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${getStatusColor(data.status)}`}>
                 {getStatusLabel(data.status)}
               </span>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex-grow flex flex-col gap-4">
        {isPending && (
          <div className="flex-grow flex items-center justify-center text-slate-400 text-sm italic py-8">
            Waiting to analyze...
          </div>
        )}

        {isAwaitingScholarId && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 leading-relaxed">
              To analyze this researcher's publications, we need their Google Scholar author ID.
            </p>
            
            <button
              onClick={handleOpenScholar}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition-colors border border-blue-200"
            >
              <Search className="w-4 h-4" />
              Open Google Scholar
            </button>

            <div className="pt-2">
              <label className="block text-xs font-medium text-slate-600 mb-2">
                Paste Scholar Author ID (e.g., "LSsXyncAAAAJ"):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={scholarIdInput}
                  onChange={(e) => setScholarIdInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmitScholarId()}
                  placeholder="LSsXyncAAAAJ"
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-imperial-accent focus:border-transparent"
                />
                <button
                  onClick={handleSubmitScholarId}
                  disabled={!scholarIdInput.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Clipboard className="w-4 h-4" />
                  Submit
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                💡 Tip: Find the author ID in the URL after clicking their name in Scholar (e.g., user=<strong>LSsXyncAAAAJ</strong>)
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3 py-2 animate-pulse">
            <div className="h-4 bg-slate-100 rounded w-3/4"></div>
            <div className="h-4 bg-slate-100 rounded w-full"></div>
            <div className="h-4 bg-slate-100 rounded w-5/6"></div>
            <div className="flex gap-2 mt-4">
              <div className="h-6 bg-slate-100 rounded-full w-16"></div>
              <div className="h-6 bg-slate-100 rounded-full w-20"></div>
            </div>
          </div>
        )}

        {isError && (
          <div className="text-red-500 text-sm py-4 text-center">
            Unable to fetch research data.
          </div>
        )}

        {isCompleted && (
          <>
            <div className="text-sm text-slate-600 leading-relaxed">
              <BrainCircuit className="w-4 h-4 inline-block mr-1.5 text-imperial-accent mb-0.5" />
              {data.interests}
            </div>
            
            {data.matchReason && isMatch && (
               <div className="text-xs bg-amber-50 text-amber-800 p-2.5 rounded-md border border-amber-100 italic">
                 "{data.matchReason}"
               </div>
            )}

            <div className="flex flex-wrap gap-2 mt-auto pt-2">
              {data.tags?.map((tag, idx) => (
                <div key={idx} className="group relative inline-block">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-help hover:bg-emerald-200 transition-colors">
                    <Tag className="w-3 h-3 mr-1 opacity-50" />
                    {tag.keyword}
                  </span>
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-80 bg-white border border-slate-200 rounded-lg shadow-xl p-4 text-left">
                    <div className="space-y-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Relevance</div>
                        <div className="text-sm text-slate-700">{tag.reasoning}</div>
                      </div>
                      
                      {tag.supportingPapers && tag.supportingPapers.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Supporting Publications</div>
                          <ul className="space-y-1.5">
                            {tag.supportingPapers.map((paper, pIdx) => (
                              <li key={pIdx} className="text-xs text-slate-600 leading-relaxed">
                                • {paper.title} {paper.year && `(${paper.year})`} 
                                {paper.citations !== undefined && (
                                  <span className="text-slate-400 ml-1">- {paper.citations} citations</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    {/* Arrow */}
                    <div className="absolute -bottom-1 left-4 w-2 h-2 bg-white border-r border-b border-slate-200 transform rotate-45"></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer / Link */}
      {isCompleted && data.profileUrl && (
        <div className="p-3 bg-slate-50 border-t border-slate-100 rounded-b-xl flex justify-end">
          <a 
            href={data.profileUrl} 
            target="_blank" 
            rel="noreferrer"
            className="text-xs font-medium text-imperial-accent hover:text-imperial-blue flex items-center gap-1 transition-colors"
          >
            View Profile <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
};

// Helpers
function getStatusColor(status: AnalysisStatus) {
  switch (status) {
    case AnalysisStatus.PENDING: return 'bg-slate-100 text-slate-500';
    case AnalysisStatus.AWAITING_SCHOLAR_ID: return 'bg-amber-100 text-amber-700';
    case AnalysisStatus.LOADING: return 'bg-blue-100 text-blue-700';
    case AnalysisStatus.COMPLETED: return 'bg-emerald-100 text-emerald-700';
    case AnalysisStatus.ERROR: return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-500';
  }
}

function getStatusLabel(status: AnalysisStatus) {
  switch (status) {
    case AnalysisStatus.PENDING: return 'Queued';
    case AnalysisStatus.AWAITING_SCHOLAR_ID: return 'Need Scholar ID';
    case AnalysisStatus.LOADING: return 'Analyzing...';
    case AnalysisStatus.COMPLETED: return 'Analyzed';
    case AnalysisStatus.ERROR: return 'Failed';
  }
}