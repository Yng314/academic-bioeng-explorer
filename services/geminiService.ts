import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalysisResult } from '../types';
import { ScholarAuthorData } from './serpApiService';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

// Initialize client
const ai = new GoogleGenAI({ apiKey });

// Helper to sanitize JSON string if the model returns markdown code blocks
const cleanJsonString = (str: string) => {
  return str.replace(/```json/g, '').replace(/```/g, '').trim();
};

export const extractNamesFromText = async (text: string): Promise<string[]> => {
  if (!apiKey) throw new Error("API Key is missing from environment variables.");

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      names: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "List of academic staff names extracted from the text."
      }
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Extract all names of academic staff, professors, lecturers, and researchers from the following text. 
      Ignore administrative staff if possible. Return strictly a JSON list.
      
      Text to process:
      ${text.substring(0, 30000)}`, // Truncate if too huge to avoid error, though 3-flash context is huge.
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    const jsonStr = response.text || "{}";
    const parsed = JSON.parse(jsonStr);
    return parsed.names || [];

  } catch (error) {
    console.error("Extraction error:", error);
    throw new Error("Failed to extract names from the provided text.");
  }
};



/**
 * Analyzes a researcher's publications from Google Scholar
 * @param name - Researcher name
 * @param scholarData - Publication data from SerpAPI
 * @param userInterests - User's research interests for matching
 */
export const analyzeScholarPublications = async (
  name: string,
  scholarData: ScholarAuthorData,
  userInterests: string
): Promise<AnalysisResult> => {
  if (!apiKey) throw new Error("API Key is missing.");

  const hasUserInterests = userInterests && userInterests.trim().length > 0;

  // Format publications for Gemini analysis
  const publicationsList = scholarData.articles.slice(0, 200).map((article, idx) => {
    return `${idx + 1}. "${article.title}" (${article.year || 'N/A'}) - Cited by: ${article.cited_by?.value || 0}`;
  }).join('\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `You are a STRICT research analyst evaluating a researcher's profile against specific user interests.
      
**Researcher Profile:** "${name}"
**Publications (Recent 50):**
${publicationsList}

${hasUserInterests ? `**User's Research Interests:** ${userInterests}` : ''}

**Your Tasks:**
1. Write a 2-3 sentence summary of their overall research focus.
${hasUserInterests ? `
2. **SEMANTIC MATCHING VERIFICATION:**
   - Go through the User's Research Interests one by one.
   - For EACH interest, check if the researcher has published work addressing it.
   - Be flexible with wording (e.g. "MRI" matches "Medical Imaging").
   - **CRITICAL:** Return a list of EXACTLY which user interests were matched.
   - **Step 3: Assign Match Type:**
     - **HIGH MATCH:** Matches >= 80% of user interests (e.g. 4 out of 5, or All).
     - **PARTIAL MATCH:** Matches 3 or more interests (but < 80%).
     - **LOW MATCH:** Matches EXACTLY TWO (2) interests.
     - **NONE:** Matches 0 or 1 interest.

3. Provide evidence:
   - Identify 3-5 specific matching keywords.
   - For each keyword, provide reasoning and 2-4 supporting publications.
` : `
2. Identify 3-5 main research keywords.
3. For each keyword, list 2-4 supporting publications.
`}

Return the result in the following JSON format:
{
  "summary": "Summary of research focus.",
  "keywords": [
    {
      "keyword": "Specific Topic",
      "reasoning": "Direct evidence of match...",
      "supportingPapers": [{"title": "...", "year": "...", "citations": 0}]
    }
  ],
  "matched_user_interests": ${hasUserInterests ? '["Interest 1", "Interest 2"]' : '[]'},
  "matchReason": "${hasUserInterests ? 'Explain the match (e.g. "Covered 4/5 interests: AI, Imaging...")' : 'null'}"
}

IMPORTANT: ${hasUserInterests ? 'Only include interests in "matched_user_interests" if there is clear evidence.' : 'Return the most prominent research themes.'}`,
      config: {
        responseMimeType: "application/json",
      }
    });

    const jsonStr = response.text || "{}";
    const parsed = JSON.parse(jsonStr);

    // --- Deterministic Match Logic ---
    let matchType = 'NONE';
    let isMatch = false;

    if (hasUserInterests) {
      // 1. Parse user input into distinct concepts (comma separated)
      const userConcepts = userInterests.split(/[,;]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
      const totalConcepts = userConcepts.length;

      // 2. Count matches returned by Gemini
      const matchedList = Array.isArray(parsed.matched_user_interests) ? parsed.matched_user_interests : [];
      const matchCount = matchedList.length;

      // 3. Apply Threshold Rules
      // High Match: >= 80% of total
      const highThreshold = Math.ceil(totalConcepts * 0.8);
      
      if (matchCount >= 2) {
         if (matchCount >= highThreshold && totalConcepts >= 2) {
           matchType = 'HIGH';
         } else if (matchCount >= 3) {
           matchType = 'PARTIAL'; // 3+ but not high enough
         } else {
           matchType = 'LOW'; // Exact 2 matches
         }
         isMatch = true;
      } else {
        matchType = 'NONE'; // 0 or 1 match
        isMatch = false;
      }

      // Special case: Single concept entered by user
      if (totalConcepts === 1 && matchCount === 1) {
         matchType = 'HIGH'; // If only 1 concept, 100% match
         isMatch = true;
      }
    }

    return {
      summary: parsed.summary || "No summary available.",
      keywords: parsed.keywords || [],
      url: scholarData.articles[0]?.citation ? 
        `https://scholar.google.com/citations?user=${name}` : undefined,
      isMatch: isMatch,
      matchType: matchType as any,
      matchReason: parsed.matchReason || undefined
    };

  } catch (error) {
    console.error(`Scholar analysis error for ${name}:`, error);
    return {
      summary: "Failed to analyze publications.",
      keywords: [],
      url: undefined,
      isMatch: false
    };
  }
};
