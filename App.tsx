import React, { useState, useCallback, useEffect, useRef } from 'react';
import { extractNamesFromText, analyzeScholarPublications } from './services/geminiService';
import { fetchScholarPublications } from './services/serpApiService';
import { Researcher, AnalysisStatus } from './types';
import { InputSection } from './components/InputSection'; // Keeping for reference until fully replaced
import { NavBar } from './components/NavBar';
import { ProfileSection } from './components/ProfileSection';
import { ProfessorSearchSection } from './components/ProfessorSearchSection';
import { CustomizeLetterSection } from './components/CustomizeLetterSection';
import { ResultsGrid } from './components/ResultsGrid';
import { FlaskConical, AlertCircle, Loader2, Play, Search, Star, LayoutGrid, RotateCw, Sparkles, X } from 'lucide-react';

const AUTO_RETRY_MAX_RETRIES = 2;
const AUTO_RETRY_BASE_DELAY_MS = 1000;

const runWithConcurrency = async <T,>(
  items: T[],
  maxConcurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> => {
  if (items.length === 0) return;

  const concurrency = Math.max(1, Math.min(maxConcurrency, items.length));
  let nextIndex = 0;

  const runners = Array.from({ length: concurrency }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      await worker(items[currentIndex]);
    }
  });

  await Promise.all(runners);
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRetriableError = (error: unknown): boolean => {
  const err = error as { status?: number; message?: string };
  const status = typeof err?.status === 'number' ? err.status : null;
  if (status === 429 || (status !== null && status >= 500)) return true;

  const message = (err?.message || '').toLowerCase();
  return (
    /\b(429|500|502|503|504)\b/.test(message) ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('temporarily unavailable') ||
    message.includes('service unavailable') ||
    message.includes('timeout') ||
    message.includes('network')
  );
};

export default function App() {
  const [userInterests, setUserInterests] = useState('');
  const [letterTemplate, setLetterTemplate] = useState('');
  const [emailTitle, setEmailTitle] = useState('');
  const [university, setUniversity] = useState('');
  const [rawText, setRawText] = useState('');
  
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [currentAnalyzingName, setCurrentAnalyzingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'favorites' | 'analyzed'>('all');
  const [activeTab, setActiveTab] = useState<'profile' | 'find' | 'customize'>('find'); // Default to 'find' tab
  const [isExtractModalOpen, setIsExtractModalOpen] = useState(false);

  // LocalStorage persistence
  const [isInitialized, setIsInitialized] = useState(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Prevent double execution in React StrictMode
    if (hasInitialized.current) {
      console.log('[Web App] Skipping duplicate initialization (StrictMode)');
      return;
    }
    hasInitialized.current = true;
    
    // Load saved data on mount
    console.log('[Web App] Loading saved data from LocalStorage...');
    const savedResearchers = localStorage.getItem('researchers');
    const savedUserInterests = localStorage.getItem('userInterests');
    const savedLetterTemplate = localStorage.getItem('letterTemplate');
    const savedEmailTitle = localStorage.getItem('emailTitle');
    const savedUniversity = localStorage.getItem('university');
    const savedRawText = localStorage.getItem('rawText');
    
    if (savedResearchers) {
      try {
        const parsed = JSON.parse(savedResearchers);
        console.log('[Web App] Restored researchers:', parsed.length);
        setResearchers(parsed);
      } catch (e) {
        console.error('Failed to parse saved researchers:', e);
      }
    }
    
    if (savedUserInterests) setUserInterests(savedUserInterests);
    if (savedLetterTemplate) setLetterTemplate(savedLetterTemplate);
    if (savedEmailTitle) setEmailTitle(savedEmailTitle);
    if (savedUniversity) setUniversity(savedUniversity);
    if (savedRawText) setRawText(savedRawText);
    
    // AFTER loading from LocalStorage, check URL parameters
    const params = new URLSearchParams(window.location.search);
    const researcherId = params.get('researcher_id');
    const authorId = params.get('author_id');
    const authorName = params.get('author_name');
    
    if (researcherId && authorId) {
      console.log('[Web App] ✅ Received author ID from URL:', {
        researcherId,
        authorId,
        authorName
      });
      
      // Update the just-loaded researchers with the author ID
      setResearchers(prev => {
        const updated = prev.map(r => 
          r.id === researcherId ? {
            ...r,
            scholarAuthorId: authorId,
            status: AnalysisStatus.PENDING
          } : r
        );
        console.log('[Web App] Updated researchers with URL data:', updated);
        return updated;
      });
      
      // Clean URL (remove parameters)
      window.history.replaceState({}, '', window.location.pathname);
      
      console.log(`[Web App] ✓ Author ID received for ${authorName}: ${authorId}`);
    }
    
    setIsInitialized(true);
  }, []);

  // Save to LocalStorage whenever data changes
  useEffect(() => {
    // Only save after data has been loaded to prevent overwriting with initial empty state
    if (!isInitialized) return;
    
    console.log('[Web App] Saving researchers to LocalStorage:', researchers.length);
    localStorage.setItem('researchers', JSON.stringify(researchers));
  }, [researchers, isInitialized]);

  useEffect(() => {
    localStorage.setItem('userInterests', userInterests);
  }, [userInterests]);

  useEffect(() => {
    localStorage.setItem('letterTemplate', letterTemplate);
  }, [letterTemplate]);

  useEffect(() => {
    localStorage.setItem('emailTitle', emailTitle);
  }, [emailTitle]);

  useEffect(() => {
    localStorage.setItem('university', university);
  }, [university]);


  useEffect(() => {
    localStorage.setItem('rawText', rawText);
  }, [rawText]);



  const handleExtractNames = useCallback(async () => {
    if (!rawText.trim()) return;
    
    setIsExtracting(true);
    setError(null);
    try {
      const names = await extractNamesFromText(rawText);
      
      const normalizeName = (s: string) => {
        return s.trim().toLowerCase().split(' ').map(word => {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
      };

      setResearchers(prev => {
        const existingNames = new Set(prev.map(r => r.name.toLowerCase()));
        
        const newResearchers: Researcher[] = names
          .map(name => normalizeName(name))
          .filter(name => name.length > 0 && !existingNames.has(name.toLowerCase()))
          .map(name => ({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name,
            status: AnalysisStatus.AWAITING_SCHOLAR_ID,
            interests: '',
            tags: []
          }));
        
        return [...prev, ...newResearchers];
      });
      setIsExtractModalOpen(false);
      setRawText('');
    } catch (err: any) {
      setError(err.message || 'Failed to extract names.');
    } finally {
      setIsExtracting(false);
    }
  }, [rawText]);


  const handleScholarIdSubmit = useCallback(async (researcherId: string, scholarId: string) => {
    // Update researcher with Scholar ID and set to loading
    setResearchers(prev => prev.map(r => 
      r.id === researcherId ? { ...r, scholarAuthorId: scholarId, status: AnalysisStatus.LOADING } : r
    ));

    const researcher = researchers.find(r => r.id === researcherId);
    if (!researcher) return;

    setCurrentAnalyzingName(researcher.name);
    setError(null);

    try {
      const maxAttempts = AUTO_RETRY_MAX_RETRIES + 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // Step 1: Fetch publications from SerpAPI
          const scholarData = await fetchScholarPublications(scholarId);

          // Validation: If no articles found, SerpAPI might have returned an empty profile or invalid ID
          if (!scholarData.articles || scholarData.articles.length === 0) {
            throw new Error("No publications found for this Scholar ID. Please verify the ID correctly matches the professor.");
          }

          // Step 2: Analyze publications with Gemini
          const result = await analyzeScholarPublications(
            researcher.name,
            scholarData,
            userInterests
          );

          // Step 3: Update researcher with results
          setResearchers(prev => prev.map(r => 
            r.id === researcherId ? {
              ...r,
              status: AnalysisStatus.COMPLETED,
              interests: result.summary,
              tags: result.keywords,
              profileUrl: `https://scholar.google.com/citations?user=${scholarId}`,
              avatarUrl: scholarData.thumbnail,
              isMatch: result.isMatch,
              matchType: result.matchType,
              matchReason: result.matchReason,
              matchedInterests: result.matchedInterests
            } : r
          ));

          return;
        } catch (attemptError) {
          const isLastAttempt = attempt === maxAttempts;
          if (isLastAttempt || !isRetriableError(attemptError)) {
            throw attemptError;
          }

          const backoffMs = AUTO_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(
            `[Web App] Retrying ${researcher.name} (${attempt + 1}/${maxAttempts}) after ${backoffMs}ms due to transient error:`,
            attemptError
          );
          await sleep(backoffMs);
        }
      }

    } catch (err: any) {
      console.error('Scholar analysis error:', err);
      setError(err.message || 'Failed to analyze publications.');
      setResearchers(prev => prev.map(r => 
        r.id === researcherId ? { ...r, status: AnalysisStatus.ERROR } : r
      ));
    } finally {
      setCurrentAnalyzingName(null);
    }
  }, [researchers, userInterests]);

  const handleScholarIdLink = useCallback((researcherId: string, scholarId: string) => {
    setResearchers(prev => prev.map(r =>
      r.id === researcherId ? {
        ...r,
        scholarAuthorId: scholarId,
        status: AnalysisStatus.PENDING,
        interests: '',
        tags: [],
        profileUrl: undefined,
        avatarUrl: undefined,
        isMatch: undefined,
        matchType: undefined,
        matchReason: undefined,
        matchedInterests: []
      } : r
    ));
    setError(null);
  }, []);

  const handleToggleFavorite = useCallback((id: string) => {
    setResearchers(prev => prev.map(r => 
      r.id === id ? { ...r, isFavorite: !r.isFavorite } : r
    ));
  }, []);

  const handleDeleteResearcher = useCallback((id: string) => {
    setResearchers(prev => prev.filter(r => r.id !== id));
  }, []);

  // Batch analyze all researchers who have author IDs
  const handleAnalyzeAll = useCallback(async () => {
    const toAnalyze = researchers.filter(r => 
      r.scholarAuthorId && 
      r.status !== AnalysisStatus.COMPLETED && 
      r.status !== AnalysisStatus.LOADING
    );

    if (toAnalyze.length === 0) {
      setError('No researchers with author IDs ready to analyze (already analyzed or missing ID)');
      return;
    }

    console.log(`[Web App] Starting batch analysis for ${toAnalyze.length} researchers`);

    await runWithConcurrency(
      toAnalyze,
      toAnalyze.length,
      async (researcher) => {
        await handleScholarIdSubmit(researcher.id, researcher.scholarAuthorId!);
      }
    );

    console.log('[Web App] Batch analysis complete');
    console.log('[Web App] Batch analysis complete');
  }, [researchers, handleScholarIdSubmit]);

  const handleRetryFailed = useCallback(async () => {
    const failedResearchers = researchers.filter(r => r.status === AnalysisStatus.ERROR);
    if (failedResearchers.length === 0) return;

    // Reset status to AWAITING_SCHOLAR_ID if they have ID, or just keep ID if they have it
    // Actually we want to retry the whole analysis process.
    // If they have scholarAuthorId, we can just call handleScholarIdSubmit again.
    
    console.log(`[Web App] Retrying ${failedResearchers.length} failed analyses`);

    const retryable = failedResearchers.filter(r => Boolean(r.scholarAuthorId));
    await runWithConcurrency(
      retryable,
      retryable.length,
      async (researcher) => {
        await handleScholarIdSubmit(researcher.id, researcher.scholarAuthorId!);
      }
    );
  }, [researchers, handleScholarIdSubmit]);

  // Clear all data
  const handleClearAll = useCallback(() => {
    setShowClearConfirm(true);
  }, []);

  const confirmClearAll = useCallback(() => {
    console.log('[Web App] Clearing all data...');
    
    // Reset all state
    // Reset all state but KEEP FAVORITES and USER INTERESTS
    setResearchers(prev => prev.filter(r => r.isFavorite));
    // setUserInterests(''); // Preserved per user request
    setRawText('');
    setRawText('');
    setError(null);
    setCurrentAnalyzingName(null);
    setShowClearConfirm(false);
    
    // Do NOT reset isInitialized, otherwise saving to localStorage will be blocked by our new guard
    // setIsInitialized(false);
    hasInitialized.current = true; // Actually we want to keep running, so true is fine, or false if we want full re-init?
    // If we set researchers (even empty or filtered), we trigger the save effect immediately.
    // So we don't need to manually clear localStorage, the effect will update it.
    
    console.log('[Web App] ✓ Cleared non-favorites');
  }, []);

  const displayedResearchers = viewMode === 'all'
    ? researchers
    : viewMode === 'favorites'
      ? researchers.filter(r => r.isFavorite)
      : researchers.filter(r => r.status === AnalysisStatus.COMPLETED || r.status === AnalysisStatus.ERROR);
    


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in">
          <div className="bg-white/90 backdrop-blur-2xl rounded-2xl shadow-2xl p-6 max-w-md mx-4 animate-modal-in border border-white/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Clear All Data?</h3>
            </div>
            
            <p className="text-slate-600 mb-4 text-sm leading-relaxed">
              This will remove all non-favorite researchers and analysis results.
              <br/>
              <span className="font-semibold text-[#0071E3]">
                {researchers.filter(r => r.isFavorite).length} favorite(s) will be saved.
              </span>
            </p>
            
            <p className="text-xs font-semibold text-red-600/80 mb-6 flex items-center gap-1.5">
              <X className="w-3 h-3" />
              This action cannot be undone.
            </p>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-black/5 hover:bg-black/10 text-slate-700 rounded-xl font-semibold transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClearAll}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-all shadow-sm active:scale-95"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extract Names Modal */}
      {isExtractModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-white/80 backdrop-blur-2xl rounded-2xl shadow-2xl w-full max-w-2xl animate-modal-in overflow-hidden border border-white/20">
            <div className="p-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Add Professors</h3>
              <button 
                onClick={() => setIsExtractModalOpen(false)}
                className="p-2 hover:bg-black/5 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  University (used for Scholar candidate narrowing)
                </label>
                <input
                  type="text"
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  placeholder="e.g. Imperial College London"
                  className="w-full p-3 bg-white/50 border border-black/5 rounded-xl focus:ring-2 focus:ring-imperial-blue focus:border-transparent transition-all text-slate-800"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Paste your list of professors to extract professor names
                </label>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste text containing professor names here..."
                  className="w-full h-64 p-4 bg-white/50 border border-black/5 rounded-xl focus:ring-2 focus:ring-imperial-blue focus:border-transparent transition-all resize-none text-slate-800"
                />
              </div>
            </div>
            
            <div className="p-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setIsExtractModalOpen(false)}
                className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-full font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExtractNames}
                disabled={isExtracting || !rawText.trim()}
                className="px-8 py-2.5 bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-full font-semibold transition-all shadow-apple hover:shadow-apple-hover active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Unified Sticky Header & Nav Wrapper */}
        <div className="sticky top-0 z-50 w-full bg-[#FAFAFA]/30 backdrop-blur-md transition-all duration-300">
          <NavBar activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      
      {/* Content Area */}
      <div className="relative z-30 min-h-screen">
        
        {/* TAB 1: MY PROFILE */}
        {activeTab === 'profile' && (
          <ProfileSection 
            userInterests={userInterests}
            setUserInterests={setUserInterests}
            letterTemplate={letterTemplate}
            setLetterTemplate={setLetterTemplate}
            emailTitle={emailTitle}
            setEmailTitle={setEmailTitle}
          />
        )}

        {/* TAB 2: FIND PROFESSOR */}
        {activeTab === 'find' && (
          <>
            {/* Main Content Area (Results) */}
            <main className="w-full">
              


              {/* Error Display (Centered) */}
              {error && (
                 <div className="max-w-7xl mx-auto px-6 py-6 animate-in fade-in slide-in-from-top-2">
                  <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5" />
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                </div>
              )}

              {/* Results Content Area */}
              <div className="max-w-7xl mx-auto px-6 pb-20 space-y-8 pt-6 min-h-[100vh]">
                {/* Results Logic */}
                {researchers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                    <div className="w-24 h-24 bg-white rounded-full shadow-apple-hover flex items-center justify-center mb-8 border border-black/5">
                      <Sparkles className="w-12 h-12 text-[#0071E3]" />
                    </div>
                    <h3 className="text-3xl font-bold text-[#1D1D1F] mb-4 tracking-tight">Ready to Explore?</h3>
                    <p className="text-[#86868B] text-center max-w-lg leading-relaxed text-lg">
                      Click the <span className="text-[#0071E3] font-bold">Add Professors</span> button in the bottom bar 
                      to paste and analyze your list of researchers.
                    </p>
                  </div>
                ) : (
                  viewMode === 'favorites' && displayedResearchers.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                      <div className="w-12 h-12 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Star className="w-6 h-6 text-yellow-400" />
                      </div>
                      <h3 className="text-slate-800 font-medium mb-1">No favorites yet</h3>
                      <p className="text-slate-500 text-sm">Star researchers to save them here.</p>
                    </div>
                  ) : viewMode === 'analyzed' && displayedResearchers.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                      <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <LayoutGrid className="w-6 h-6 text-blue-500" />
                      </div>
                      <h3 className="text-slate-800 font-medium mb-1">No analyzed professors yet</h3>
                      <p className="text-slate-500 text-sm">Run analysis to populate this list.</p>
                    </div>
                  ) : (
                    <ResultsGrid 
                      researchers={displayedResearchers} 
                      university={university}
                      onScholarIdLink={handleScholarIdLink}
                      onScholarIdSubmit={handleScholarIdSubmit}
                      onToggleFavorite={handleToggleFavorite}
                      onDeleteResearcher={handleDeleteResearcher}
                    />
                  )
                )}
              </div>

              {/* Full-Width Sticky Bottom Action Bar */}
              {activeTab === 'find' && (
                <div className="sticky bottom-0 z-40 w-full bg-[#FAFAFA]/30 backdrop-blur-xl animate-in slide-in-from-bottom-4 fade-in duration-500">
                  <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                     
                     <div className="flex items-center gap-6">
                       {/* Title & Badge */}
                       <div className="flex items-center gap-3">
                         <h2 className="text-xl font-semibold tracking-wide text-[#1D1D1F]">
                           Analysis
                         </h2>
                         <span className="bg-[#E8E8ED] text-[#1D1D1F] text-[12px] font-bold px-2 py-0.5 rounded-full">
                           {researchers.length} Professors
                         </span>
                       </div>

                       <button
                         onClick={() => setIsExtractModalOpen(true)}
                         className="flex items-center gap-2 px-4 py-2 bg-white/60 hover:bg-white border border-black/5 text-[#1D1D1F] rounded-full text-xs font-semibold transition-all shadow-sm active:scale-95"
                       >
                         <Search className="w-3.5 h-3.5" />
                         Add Professors
                       </button>
                     </div>
                     
                     {/* Actions Group (Only visible if has results) */}
                     {researchers.length > 0 && (
                       <div className="flex items-center gap-3 animate-in fade-in zoom-in-95 duration-300">
                          <button
                            onClick={handleAnalyzeAll}
                            disabled={isExtracting}
                            className="flex items-center gap-2 px-5 py-2 bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-full text-xs font-semibold transition-all shadow-apple hover:shadow-apple-hover active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span className="hidden sm:inline">Batch Analyze</span>
                            <span className="sm:hidden">Run</span>
                          </button>
                          
                          <div className="w-px h-6 bg-black/10"></div>

                          <div className="flex bg-[#E8E8ED]/70 p-1 rounded-full">
                            <button 
                              onClick={() => setViewMode('all')}
                              className={`px-4 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                                viewMode === 'all' 
                                  ? 'bg-white text-[#1D1D1F] shadow-sm' 
                                  : 'text-[#86868B] hover:text-[#1D1D1F]'
                              }`}
                            >
                              All
                            </button>
                            <button 
                              onClick={() => setViewMode('favorites')}
                              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                                viewMode === 'favorites' 
                                  ? 'bg-white text-[#1D1D1F] shadow-sm' 
                                  : 'text-[#86868B] hover:text-[#1D1D1F]'
                              }`}
                            >
                              <Star className={`w-3 h-3 ${viewMode === 'favorites' ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                              Favorites
                            </button>
                            <button 
                              onClick={() => setViewMode('analyzed')}
                              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                                viewMode === 'analyzed' 
                                  ? 'bg-white text-[#1D1D1F] shadow-sm' 
                                  : 'text-[#86868B] hover:text-[#1D1D1F]'
                              }`}
                            >
                              <LayoutGrid className="w-3 h-3" />
                              Analyzed
                            </button>
                          </div>
                          
                          <div className="w-px h-6 bg-black/10 mx-1"></div>

                          <button
                            onClick={handleClearAll}
                            className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                            title="Clear All"
                          >
                            <X className="w-4 h-4" />
                          </button>
                       </div>
                     )}
                  </div>
                </div>
              )}
            </main>
          </>
        )}

        {/* TAB 3: CUSTOMIZE LETTER */}
        {activeTab === 'customize' && (
           <CustomizeLetterSection 
             favoriteResearchers={researchers.filter(r => r.isFavorite)}
             letterTemplate={letterTemplate}
             emailTitle={emailTitle}
             userInterests={userInterests}
             onUpdateResearcher={(id, updates) => {
               setResearchers(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
             }}
           />
        )}
      </div>
        {/* Intro / Instructions (Moved to bottom) */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 opacity-80 hover:opacity-100 transition-opacity">
          <h2 className="text-lg font-semibold text-slate-800 mb-2 flex items-center gap-2">
            <Search className="w-5 h-5 text-imperial-accent" />
            How it works
          </h2>
          <p className="text-slate-600 text-sm mb-4 leading-relaxed">
             1. Enter <strong>University</strong> and <strong>Department</strong>.
             <br/>
             2. Enter <strong>Your Interests</strong> for AI-powered matching.
             <br/>
             3. <strong>Paste staff list text</strong> to extract names.
             <br/>
             4. Click "Analyze All" to process.
          </p>
        </section>


      <footer className="py-6 text-center text-slate-400 text-sm">
        <p>&copy; {new Date().getFullYear()} Research Explorer.</p>
      </footer>
    </div>
  );
}
