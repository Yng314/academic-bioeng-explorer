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
      contents: `You are analyzing the research profile of "${name}" based on their Google Scholar publications.

**Publications (up to 200):**
${publicationsList}

${hasUserInterests ? `**User's Research Interests:** ${userInterests}` : ''}

**Your Tasks:**
1. Write a 2-3 sentence summary of their overall research focus
${hasUserInterests ? `
2. Identify 3-5 SPECIFIC research keywords that MATCH the user's interests
3. For EACH keyword, provide:
   - Why it matches the user's interests
   - List of 2-4 supporting publications (with title, year, citations)
4. Only include keywords that have semantic relevance to "${userInterests}"
` : `
2. Identify 3-5 main research keywords
3. For each keyword, list 2-4 supporting publications
`}

Return the result in the following JSON format:
{
  "summary": "A 2-3 sentence summary highlighting their main research areas.",
  "keywords": [
    {
      "keyword": "Research Topic Name",
      "reasoning": "${hasUserInterests ? 'Explain how this relates to user interests' : 'Why this is a key research area'}",
      "supportingPapers": [
        {
          "title": "Paper Title",
          "year": "2024",
          "citations": 50
        }
      ]
    }
  ],
  "isMatch": ${hasUserInterests ? 'boolean (true if keywords match user interests)' : 'false'},
  "matchReason": "${hasUserInterests ? 'Brief explanation of the overall match' : 'null'}"
}

IMPORTANT: ${hasUserInterests ? 'ONLY return keywords that are semantically related to the user interests. If no strong matches exist, return an empty keywords array.' : 'Return the most prominent research themes.'}`,
      config: {
        responseMimeType: "application/json",
      }
    });

    const jsonStr = response.text || "{}";
    const parsed = JSON.parse(jsonStr);

    return {
      summary: parsed.summary || "No summary available.",
      keywords: parsed.keywords || [],
      url: scholarData.articles[0]?.citation ? 
        `https://scholar.google.com/citations?user=${name}` : undefined,
      isMatch: !!parsed.isMatch,
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