import React, { useState, useCallback, useEffect, useRef } from 'react';
import { extractNamesFromText, analyzeScholarPublications } from './services/geminiService';
import { fetchScholarPublications } from './services/serpApiService';
import { Researcher, AnalysisStatus } from './types';
import { InputSection } from './components/InputSection';
import { ResultsGrid } from './components/ResultsGrid';
import { FlaskConical, AlertCircle, Loader2, Play, Search, Star, LayoutGrid, RotateCw } from 'lucide-react';

export default function App() {
  const [userInterests, setUserInterests] = useState('');
  const [rawText, setRawText] = useState('');
  
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [currentAnalyzingName, setCurrentAnalyzingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'favorites'>('all');

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
            status: AnalysisStatus.AWAITING_SCHOLAR_ID
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
    localStorage.setItem('rawText', rawText);
  }, [rawText]);



  const handleExtractNames = useCallback(async () => {
    if (!rawText.trim()) return;
    
    setIsExtracting(true);
    setError(null);
    try {
      const names = await extractNamesFromText(rawText);
      const initialResearchers: Researcher[] = names.map(name => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        status: AnalysisStatus.AWAITING_SCHOLAR_ID,
        interests: '',
        tags: []
      }));
      setResearchers(prev => {
        const favorites = prev.filter(r => r.isFavorite);
        const favoriteNames = new Set(favorites.map(f => f.name.toLowerCase()));
        
        // Only valid new researchers are those not already favorited
        const uniqueNewResearchers = initialResearchers.filter(
          r => !favoriteNames.has(r.name.toLowerCase())
        );
        
        return [...favorites, ...uniqueNewResearchers];
      });
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
      // Step 1: Fetch publications from SerpAPI
      const scholarData = await fetchScholarPublications(scholarId);

      // Step 2: Analyze publications with Gemini
      const result = await analyzeScholarPublications(
        researcher.name,
        scholarData,
        userInterests
      );

      if (result.summary === "Failed to analyze publications.") {
        throw new Error("Failed to analyze publications. Please retry.");
      }

      // Step 3: Update researcher with results
      setResearchers(prev => prev.map(r => 
        r.id === researcherId ? {
          ...r,
          status: AnalysisStatus.COMPLETED,
          interests: result.summary,
          tags: result.keywords,
          profileUrl: `https://scholar.google.com/citations?user=${scholarId}`,
          isMatch: result.isMatch,
          matchType: result.matchType,
          matchReason: result.matchReason
        } : r
      ));

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

  const handleToggleFavorite = useCallback((id: string) => {
    setResearchers(prev => prev.map(r => 
      r.id === id ? { ...r, isFavorite: !r.isFavorite } : r
    ));
  }, []);

  // Batch analyze all researchers who have author IDs
  const handleAnalyzeAll = useCallback(async () => {
    const toAnalyze = researchers.filter(r => 
      r.scholarAuthorId && r.status === AnalysisStatus.AWAITING_SCHOLAR_ID
    );

    if (toAnalyze.length === 0) {
      setError('No researchers with author IDs ready to analyze');
      return;
    }

    console.log(`[Web App] Starting batch analysis for ${toAnalyze.length} researchers`);
    
    // Analyze them one by one (sequential to avoid rate limits)
    for (const researcher of toAnalyze) {
      await handleScholarIdSubmit(researcher.id, researcher.scholarAuthorId!);
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

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
    
    for (const r of failedResearchers) {
      if (r.scholarAuthorId) {
        // Reset to loading state first to show UI feedback
        setResearchers(prev => prev.map(res => 
           res.id === r.id ? { ...res, status: AnalysisStatus.LOADING } : res
        ));
        
        await handleScholarIdSubmit(r.id, r.scholarAuthorId);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
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
    : researchers.filter(r => r.isFavorite);
    


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Clear All Data?</h3>
            </div>
            
            <p className="text-slate-600 mb-4">
              This will remove all non-favorite researchers and analysis results.
              <br/>
              <span className="font-semibold text-imperial-blue">
                {researchers.filter(r => r.isFavorite).length} favorite(s) will be saved.
              </span>
            </p>
            
            <ul className="text-sm text-slate-600 space-y-1 mb-6 ml-4">
              <li>• Unsaved researcher names</li>
              <li>• Research interests input</li>
              <li>• Analysis results (non-favorites)</li>
            </ul>
            
            <p className="text-sm font-semibold text-red-600 mb-6">
              ⚠️ This action cannot be undone.
            </p>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClearAll}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-imperial-blue text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <FlaskConical className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Professor Matcher</h1>
              <p className="text-xs text-imperial-light opacity-80">AI-Powered Supervisor Matcher</p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-white/60">Powered by Yng</p>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-4 py-8 w-full space-y-8">
        


        {/* Input Area */}
        <InputSection 
          userInterests={userInterests}
          setUserInterests={setUserInterests}
          rawText={rawText} 
          setRawText={setRawText} 
          onExtract={handleExtractNames}
          isExtracting={isExtracting}
          hasResults={researchers.length > 0}
        />

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200 flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        )}

        {/* Status Bar (if names exist) */}
        {researchers.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4 sticky top-20 z-40">
            <div className="flex items-center gap-4">
               <span className="text-slate-600 font-medium">
                  Found <span className="text-imperial-blue font-bold">{researchers.length}</span> researchers
               </span>
               <div className="h-4 w-px bg-slate-200"></div>
               <div className="text-sm text-slate-500">
                  {researchers.filter(r => r.status === AnalysisStatus.COMPLETED).length} analyzed
               </div>
               <div className="h-4 w-px bg-slate-200"></div>
               <div className="text-sm text-slate-500">
                  {researchers.filter(r => r.scholarAuthorId && r.status === AnalysisStatus.AWAITING_SCHOLAR_ID).length} ready to analyze
               </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Analyze All Button */}
              {researchers.filter(r => r.scholarAuthorId && r.status === AnalysisStatus.AWAITING_SCHOLAR_ID).length > 0 && (
                <button
                  type="button"
                  onClick={handleAnalyzeAll}
                  disabled={!!currentAnalyzingName}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Analyze All ({researchers.filter(r => r.scholarAuthorId && r.status === AnalysisStatus.AWAITING_SCHOLAR_ID).length})
                </button>
              )}
              
              <button
                type="button"
                onClick={handleClearAll}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-medium transition-colors flex items-center gap-2 border border-red-200"
              >
                <AlertCircle className="w-4 h-4" />
                Clear All
              </button>
              
              {/* Retry Failed Button */}
              {researchers.some(r => r.status === AnalysisStatus.ERROR) && (
                <button
                  type="button"
                  onClick={handleRetryFailed}
                  disabled={!!currentAnalyzingName}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg font-medium transition-colors flex items-center gap-2 border border-slate-200"
                  title="Retry failed analyses"
                >
                  <RotateCw className={`w-4 h-4 ${!!currentAnalyzingName ? 'animate-spin' : ''}`} />
                  Retry Failed ({researchers.filter(r => r.status === AnalysisStatus.ERROR).length})
                </button>
              )}
            </div>
            
            {currentAnalyzingName && (
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing {currentAnalyzingName}...
              </div>
            )}
          </div>
        )}

        {/* Tabs and Results */}
        {researchers.length > 0 && (
          <div className="flex gap-2 border-b border-slate-200 mb-6">
            <button
              onClick={() => setViewMode('all')}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm transition-colors ${
                viewMode === 'all' 
                  ? 'border-imperial-blue text-imperial-blue' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              All Results
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">
                {researchers.length}
              </span>
            </button>
            <button
              onClick={() => setViewMode('favorites')}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm transition-colors ${
                viewMode === 'favorites' 
                  ? 'border-yellow-400 text-slate-800' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Star className={`w-4 h-4 ${viewMode === 'favorites' ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              Favorites
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">
                {researchers.filter(r => r.isFavorite).length}
              </span>
            </button>
          </div>
        )}

        {viewMode === 'favorites' && displayedResearchers.length === 0 && researchers.length > 0 ? (
           <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
             <div className="w-12 h-12 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-3">
               <Star className="w-6 h-6 text-yellow-400" />
             </div>
             <h3 className="text-slate-800 font-medium mb-1">No favorites yet</h3>
             <p className="text-slate-500 text-sm">Star researchers to save them here.</p>
           </div>
        ) : (
          <ResultsGrid 
            researchers={displayedResearchers} 
            onScholarIdSubmit={handleScholarIdSubmit}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

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

      </main>

      <footer className="py-6 text-center text-slate-400 text-sm">
        <p>&copy; {new Date().getFullYear()} Research Explorer.</p>
      </footer>
    </div>
  );
}