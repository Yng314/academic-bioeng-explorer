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

interface Context {
  university: string;
  department: string;
  userInterests: string;
}

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
      model: 'gemini-3-flash-preview',
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
  "matchReason": "${hasUserInterests ? 'Explain the match (e.g. "Covered 2/3 interests: AI and Imaging")' : 'null'}"
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

      // 3. Apply STRICT rules
      if (matchCount >= 2) {
         if (matchCount >= totalConcepts && totalConcepts >= 2) {
           matchType = 'FULL';
         } else if (matchCount >= 3) {
           matchType = 'PARTIAL'; // 3+ but not all
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
         // If user only typed 1 thing, we allow it (though UI might say LOW or PARTIAL?)
         // Let's call it LOW for now to ensure it shows up, or NONE if we strictly want 2+ logic?
         // User Rule: "Low Match (2个), 只有1个也不算match" -> So 1 match is NONE unless...
         // Actually, if user ONLY asked for 1 thing, it's impossible to get 2 matches.
         // Assumption: User usually inputs multiple. If they input 1, we should probably show it.
         // But sticking to USER REQUEST: "只有1个也不算match" (likely in context of multiple).
         // Let's assume strict 2+ rule applies. But if Total=1, we can't match 2.
         // Logic: If TotalConcepts == 1, then 1 match is FULL.
         if (totalConcepts === 1) {
             matchType = 'FULL';
             isMatch = true;
         }
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

export const analyzeResearcherProfile = async (name: string, context: Context): Promise<AnalysisResult> => {
  if (!apiKey) throw new Error("API Key is missing.");

  const toolConfig = {
    tools: [{ googleSearch: {} }]
  };

  const hasUserInterests = context.userInterests && context.userInterests.trim().length > 0;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Search for the academic profile of "${name}" at ${context.university} (Department of ${context.department}), focusing on their Google Scholar profile and official university page.
      
      Tasks:
      1. Analyze their research interests based on their most cited and recent publications.
      2. Identify 3-5 specific keywords related to their work.
      3. Find a URL to their Google Scholar profile or official ${context.university} profile.
      ${hasUserInterests ? `4. Compare their work with the User's Research Interests: "${context.userInterests}". Determine if there is a semantic match (e.g. if user likes "Medical Imaging", then "MRI" or "CT" is a match).` : ''}

      Return the result in the following JSON format:
      {
        "summary": "A 2-3 sentence summary of their research focus based on their publications.",
        "keywords": ["keyword1", "keyword2", "keyword3"],
        "url": "http://example.com/profile",
        "isMatch": boolean, // ${hasUserInterests ? 'True if their work semantically aligns with user interests, false otherwise.' : 'Always false if no user interests provided.'}
        "matchReason": "Short explanation of why it matches (e.g. 'MRI reconstruction falls under Medical Imaging'). Return null if no match."
      }
      
      If you cannot find specific info, give a best guess based on general context or state 'Information not found'.`,
      config: {
        ...toolConfig,
        responseMimeType: "application/json",
      }
    });

    const jsonStr = response.text || "{}";
    const parsed = JSON.parse(jsonStr);

    // Extract citation links if available from grounding to use as the URL if the model didn't return one in JSON
    let profileUrl = parsed.url;
    if ((!profileUrl || profileUrl === 'Information not found') && response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        const chunks = response.candidates[0].groundingMetadata.groundingChunks;
        // Find the first web URI
        const webChunk = chunks.find((c: any) => c.web?.uri);
        if (webChunk) {
            profileUrl = webChunk.web.uri;
        }
    }

    return {
      summary: parsed.summary || "No summary available.",
      keywords: parsed.keywords || [],
      url: profileUrl,
      isMatch: !!parsed.isMatch,
      matchReason: parsed.matchReason || undefined
    };

  } catch (error) {
    console.error(`Analysis error for ${name}:`, error);
    // Return a graceful error state object rather than throwing to keep the queue moving
    return {
      summary: "Failed to retrieve research data.",
      keywords: [],
      url: undefined,
      isMatch: false
    };
  }
};