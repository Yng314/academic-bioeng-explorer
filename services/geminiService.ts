import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalysisResult, MatchType, Researcher } from '../types';
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
      
      CRITICAL RULES:
      1. RETURN ONLY THE NAMES.
      2. EXCLUDE all professional titles (e.g., Dr., Prof., Professor, PhD, MD, Assistant Professor, etc.).
      3. Use Proper Case (e.g., "John Doe", not "JOHN DOE" or "john doe").
      4. Ignore administrative or technical support staff.
      
      Return strictly a JSON list of strings.
      
      Text to process:
      ${text.substring(0, 30000)}`, // Truncate if too huge to avoid error, though 3-flash context is huge.
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    const jsonStr = cleanJsonString(response.text || "{}");
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
     - **PERFECT MATCH:** Matches 100% of user interests.
     - **HIGH MATCH:** Matches >= 80% but below 100%.
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

    const parsedUserInterests = userInterests
      .split(/[,;]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    const userInterestMap = new Map(parsedUserInterests.map(i => [i.toLowerCase(), i]));
    const rawMatchedInterests = Array.isArray(parsed.matched_user_interests) ? parsed.matched_user_interests : [];
    const matchedInterests = Array.from(
      new Set(
        rawMatchedInterests
          .filter((item: unknown): item is string => typeof item === 'string')
          .map(item => item.trim().toLowerCase())
          .filter(item => item.length > 0 && userInterestMap.has(item))
      )
    ).map(item => userInterestMap.get(item) || item);

    // --- Deterministic Match Logic ---
    let matchType: MatchType = MatchType.NONE;
    let isMatch = false;

    if (hasUserInterests) {
      const totalConcepts = parsedUserInterests.length;
      const matchCount = matchedInterests.length;

      // 3. Apply Threshold Rules
      // High Match: >= 80% of total
      const highThreshold = Math.ceil(totalConcepts * 0.8);
      
      if (totalConcepts > 0 && matchCount === totalConcepts) {
        matchType = MatchType.PERFECT;
        isMatch = true;
      } else if (matchCount >= 2) {
        if (matchCount >= highThreshold && totalConcepts >= 2) {
          matchType = MatchType.HIGH;
        } else if (matchCount >= 3) {
          matchType = MatchType.PARTIAL; // 3+ but not high enough
        } else {
          matchType = MatchType.LOW; // Exact 2 matches
        }
        isMatch = true;
      } else {
        matchType = MatchType.NONE; // 0 or 1 match
        isMatch = false;
      }
    }

    return {
      summary: parsed.summary || "No summary available.",
      keywords: parsed.keywords || [],
      isMatch: isMatch,
      matchType: matchType,
      matchReason: parsed.matchReason || undefined,
      matchedInterests
    };

  } catch (error: any) {
    console.error(`Scholar analysis error for ${name}:`, error);
    throw new Error(`Gemini analysis failed: ${error?.message || 'Unknown error'}`);
  }
};

/**
 * Generates a customized outreach letter based on a template and researcher data
 */
export const generateCustomizedLetter = async (
  template: string,
  researcher: Researcher,
  userInterests: string
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is missing.");

  // Extract relevant research themes from the researcher's analysis
  const themeList = (researcher.tags || []).map(t => t.keyword).filter(Boolean);
  const researcherThemes = themeList.join(', ') || 'their research field';
  const matchedInterestList = (researcher.matchedInterests || [])
    .map(i => i.trim())
    .filter(i => i.length > 0);
  const intersectionKeywords = matchedInterestList.length > 0
    ? matchedInterestList.join(', ')
    : themeList.slice(0, 3).join(', ');

  const intersectionPlaceholderPattern = /\[key words of the intersection of professor['’]s research interests and mine\]/gi;
  const templateWithIntersection = template.replace(
    intersectionPlaceholderPattern,
    intersectionKeywords || 'relevant shared research topics'
  );

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `You are an expert academic mentor helping a student customize an outreach email to a professor.

**Task:** Refine the provided "Letter Template" to specifically address Professor "${researcher.name}".

**Data Provided:**
1. **Student's Template:** 
"""
${templateWithIntersection}
"""

2. **Student's Interests:** "${userInterests}"

3. **Professor's Research Profile:**
   - **Key Themes:** ${researcherThemes}
   - **Summary:** ${researcher.interests || 'N/A'}
4. **Precomputed Interest Intersection (User ∩ Professor):** ${intersectionKeywords || 'None'}

**Instructions:**
- Keep the structure and tone of the original template.
- Replace placeholders like "[Name]" with "Professor ${researcher.name.split(' ').pop()}".
- Preserve any emphasis markers from the template ("[[B]]...[[/B]]", "****...****", or "**...**") instead of removing them.
- If the template includes the intersection placeholder, use ONLY the precomputed intersection keywords and do not invent extra keywords.
- Keep the sentence "I have been closely following your group's recent advancements in ..." tightly anchored to the intersection keywords only.
- Do not introduce new research topics beyond the precomputed intersection keywords and the provided key themes.
- Do NOT mention any specific paper title, publication title, or citation details.
- Instead, write one short, high-level sentence describing how the student's interests align with the professor's research direction.
- Keep this alignment sentence concrete but concise (no long expansion, no invented details).
- Keep it concise and professional.
- Return ONLY the full body of the email text. Do not return Markdown formatting or comments.`,
    });

    return response.text || "Failed to generate letter.";

  } catch (error) {
    console.error("Letter generation error:", error);
    throw new Error("Failed to generate customized letter.");
  }
};
