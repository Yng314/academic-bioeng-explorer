import React, { useState, useCallback } from 'react';
import { extractNamesFromText, analyzeScholarPublications } from './services/geminiService';
import { fetchScholarPublications } from './services/serpApiService';
import { Researcher, AnalysisStatus } from './types';
import { InputSection } from './components/InputSection';
import { ResultsGrid } from './components/ResultsGrid';
import { FlaskConical, Loader2, Play, Search, AlertCircle } from 'lucide-react';

export default function App() {
  const [userInterests, setUserInterests] = useState('');
  const [rawText, setRawText] = useState('');
  
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [currentAnalyzingName, setCurrentAnalyzingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setResearchers(initialResearchers);
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

      // Step 3: Update researcher with results
      setResearchers(prev => prev.map(r => 
        r.id === researcherId ? {
          ...r,
          status: AnalysisStatus.COMPLETED,
          interests: result.summary,
          tags: result.keywords,
          profileUrl: `https://scholar.google.com/citations?user=${scholarId}`,
          isMatch: result.isMatch,
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-imperial-blue text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <FlaskConical className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Academic Research Explorer</h1>
              <p className="text-xs text-imperial-light opacity-80">AI-Powered Research Summarizer</p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-white/60">Powered by Gemini 2.0 Flash</p>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-4 py-8 w-full space-y-8">
        
        {/* Intro / Instructions */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-2 flex items-center gap-2">
            <Search className="w-5 h-5 text-imperial-accent" />
            How it works
          </h2>
          <p className="text-slate-600 text-sm mb-4 leading-relaxed">
             This tool helps you explore research interests of academic staff from any university.
             <br/>
             1. Enter the <strong>University</strong> and <strong>Department</strong> names.
             <br/>
             2. (Optional) Enter <strong>Your Interests</strong> to automatically highlight matching professors.
             <br/>
             3. <strong>Copy the text</strong> (names and titles) from the staff directory page and paste it below.
          </p>
        </section>

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
                  {researchers.filter(r => r.status === AnalysisStatus.AWAITING_SCHOLAR_ID).length} awaiting ID
               </div>
            </div>
            
            {currentAnalyzingName && (
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing {currentAnalyzingName}...
              </div>
            )}
          </div>
        )}

        {/* Results */}
        <ResultsGrid researchers={researchers} onScholarIdSubmit={handleScholarIdSubmit} />

      </main>

      <footer className="py-6 text-center text-slate-400 text-sm">
        <p>&copy; {new Date().getFullYear()} Research Explorer.</p>
      </footer>
    </div>
  );
}