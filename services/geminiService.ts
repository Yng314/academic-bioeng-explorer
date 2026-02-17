import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalysisResult, MatchType, Researcher } from '../types';
import { ScholarAuthorData } from './serpApiService';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

// Initialize client
const ai = new GoogleGenAI({ apiKey });

export const DEFAULT_LETTER_MODEL = 'gemini-3-pro-preview';

export interface HomepageEmailExtractionResult {
  email?: string;
  resolvedHomepageUrl?: string;
}

export const DEFAULT_LETTER_GENERATION_PROMPT_TEMPLATE = `You are an expert academic mentor helping a student customize an outreach email to a professor.

**Task:** Refine the provided "Letter Template" to specifically address Professor "{{professor_name}}".

**Data Provided:**
1. **Student's Template:**
"""
{{student_template}}
"""

2. **Student's Interests:** "{{user_interests}}"

3. **Professor's Research Profile:**
   - **Key Themes:** {{researcher_themes}}
   - **Summary:** {{researcher_summary}}
4. **Precomputed Interest Intersection (User ∩ Professor):** {{intersection_keywords}}

**Instructions:**
- Keep the structure and tone of the original template.
- Replace placeholders like "[Name]" with "Professor {{professor_last_name}}".
- Preserve any emphasis markers from the template ("[[B]]...[[/B]]", "****...****", or "**...**") instead of removing them.
- If the template includes the intersection placeholder, use ONLY the precomputed intersection keywords and do not invent extra keywords.
- Keep the sentence "I have been closely following your group's recent advancements in ..." tightly anchored to the intersection keywords only.
- Do not introduce new research topics beyond the precomputed intersection keywords and the provided key themes.
- Do NOT mention any specific paper title, publication title, or citation details.
- Instead, write one short, high-level sentence describing how the student's interests align with the professor's research direction.
- Keep this alignment sentence concrete but concise (no long expansion, no invented details).
- Keep it concise and professional.
- Return ONLY the full body of the email text. Do not return Markdown formatting or comments.`;

export const DEFAULT_LETTER_REVISION_PROMPT_TEMPLATE = `You are revising a student outreach email to a professor based on a targeted annotation.

Professor: {{professor_name}}
Student interests: {{user_interests}}
Professor themes: {{researcher_themes}}
Intersection keywords: {{intersection_keywords}}

CURRENT LETTER (full text):
"""
{{current_letter}}
"""

SELECTED TEXT TO REVISE:
"""
{{selected_text}}
"""

ANNOTATION / REQUEST:
"""
{{annotation}}
"""

Instructions:
- Rewrite the letter to satisfy the annotation.
- Focus changes around the selected text; keep unrelated parts as stable as possible.
- Keep the structure, tone, and intent of the current letter.
- Preserve formatting markers like [[B]]...[[/B]], ****...****, and **...** when present.
- Do not invent specific paper titles, publication claims, or factual details not provided.
- Return ONLY the full revised letter body text with no markdown and no commentary.`;

export interface LetterModelOptions {
  model?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
}

export interface LetterGenerationOptions extends LetterModelOptions {
  promptTemplate?: string;
}

export interface LetterRevisionOptions extends LetterModelOptions {
  promptTemplate?: string;
}

const renderPromptTemplate = (
  template: string,
  variables: Record<string, string>
) => {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => variables[key] ?? '');
};

const getLetterModelConfig = (options?: LetterModelOptions) => {
  const config: Record<string, number> = {};
  if (typeof options?.temperature === 'number') config.temperature = options.temperature;
  if (typeof options?.topP === 'number') config.topP = options.topP;
  if (typeof options?.topK === 'number') config.topK = options.topK;
  if (typeof options?.maxOutputTokens === 'number') config.maxOutputTokens = options.maxOutputTokens;
  return config;
};

const getLetterModelName = (options?: LetterModelOptions) => {
  const overrideModel = options?.model?.trim();
  return overrideModel || DEFAULT_LETTER_MODEL;
};

// Helper to sanitize JSON string if the model returns markdown code blocks
const cleanJsonString = (str: string) => {
  return str.replace(/```json/g, '').replace(/```/g, '').trim();
};

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const STRICT_EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

const normalizeEmail = (value: string): string => {
  return value
    .trim()
    .replace(/[),;:]+$/g, '')
    .toLowerCase();
};

const normalizeTextForEmailSearch = (text: string): string => {
  return text
    .replace(/\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\}/gi, '@')
    .replace(/\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}/gi, '.')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s+dot\s+/gi, '.')
    .replace(/\s*@\s*/g, '@')
    .replace(/\s*\.\s*/g, '.')
    .toLowerCase();
};

const getDomainCandidates = (homepageUrl?: string, verifiedEmailHint?: string): string[] => {
  const domains: string[] = [];

  if (homepageUrl) {
    try {
      const hostname = new URL(homepageUrl).hostname.toLowerCase();
      const parts = hostname.split('.').filter(Boolean);
      domains.push(hostname);
      if (parts.length >= 3) domains.push(parts.slice(-3).join('.'));
      if (parts.length >= 2) domains.push(parts.slice(-2).join('.'));
    } catch {
      // Ignore invalid homepage URL here.
    }
  }

  if (verifiedEmailHint) {
    const hintMatch = verifiedEmailHint.match(/\bat\s+([a-z0-9.-]+\.[a-z]{2,})\b/i);
    if (hintMatch?.[1]) domains.push(hintMatch[1].toLowerCase());
  }

  return Array.from(new Set(domains.filter(Boolean)));
};

const getEmailCandidatesFromText = (text: string): string[] => {
  const directMatches = Array.from(text.matchAll(EMAIL_REGEX))
    .map(match => normalizeEmail(match[0]))
    .filter(email => STRICT_EMAIL_REGEX.test(email));

  const normalizedObfuscated = normalizeTextForEmailSearch(text);

  const obfuscatedMatches = Array.from(normalizedObfuscated.matchAll(EMAIL_REGEX))
    .map(match => normalizeEmail(match[0]))
    .filter(email => STRICT_EMAIL_REGEX.test(email));

  return Array.from(new Set([...directMatches, ...obfuscatedMatches]));
};

const buildHomepageUrlCandidates = (homepageUrl: string): string[] => {
  const candidates = new Set<string>();

  try {
    const parsed = new URL(homepageUrl);
    candidates.add(parsed.toString());

    if (parsed.protocol === 'http:') {
      const httpsUrl = new URL(parsed.toString());
      httpsUrl.protocol = 'https:';
      candidates.add(httpsUrl.toString());
    }

    if (parsed.hostname.startsWith('www.')) {
      const noWwwUrl = new URL(parsed.toString());
      noWwwUrl.hostname = parsed.hostname.replace(/^www\./i, '');
      candidates.add(noWwwUrl.toString());

      if (noWwwUrl.protocol === 'http:') {
        const noWwwHttps = new URL(noWwwUrl.toString());
        noWwwHttps.protocol = 'https:';
        candidates.add(noWwwHttps.toString());
      }
    }
  } catch {
    candidates.add(homepageUrl);
  }

  return Array.from(candidates);
};

const fetchHomepageTextFromReader = async (homepageUrl: string): Promise<string | undefined> => {
  const readerProxyUrl = `/api/jina/${encodeURI(homepageUrl)}`;
  const response = await fetch(readerProxyUrl);
  if (!response.ok) {
    throw new Error(`Homepage reader failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  // r.jina may return JSON error payloads with HTTP 200. Treat them as failures.
  if (trimmed.startsWith('{') && trimmed.includes('"AssertionFailureError"')) {
    return undefined;
  }
  if (trimmed.includes('"Failed to goto') && trimmed.includes('"readableMessage"')) {
    return undefined;
  }

  return text;
};

const pickBestEmailCandidate = (emails: string[], domainCandidates: string[]): string | undefined => {
  if (emails.length === 0) return undefined;

  for (const domain of domainCandidates) {
    const domainMatch = emails.find(email => email.endsWith(`@${domain}`));
    if (domainMatch) return domainMatch;
  }

  return emails[0];
};

const extractEmailWithGeminiFlash = async (
  pageText: string,
  homepageUrl: string,
  researcherName?: string
): Promise<string | undefined> => {
  if (!apiKey) return undefined;

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      email: {
        type: Type.STRING,
        description: 'Single best contact email; empty string if no email is present.'
      }
    }
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Extract one best professor contact email from this webpage content.

Rules:
- Return only one real email address.
- Prefer a personal academic email over generic mailboxes.
- If no email exists, return empty string.

Professor: ${researcherName || 'Unknown'}
Homepage URL: ${homepageUrl}

Page text:
${pageText.slice(0, 40000)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0
    }
  });

  const jsonStr = cleanJsonString(response.text || "{}");
  const parsed = JSON.parse(jsonStr);
  const rawEmail = typeof parsed?.email === 'string' ? normalizeEmail(parsed.email) : '';
  return STRICT_EMAIL_REGEX.test(rawEmail) ? rawEmail : undefined;
};

export const extractProfessorEmailFromScholarHomepage = async (
  homepageUrl?: string,
  researcherName?: string,
  verifiedEmailHint?: string
): Promise<HomepageEmailExtractionResult> => {
  if (!homepageUrl || !homepageUrl.trim()) return {};

  let normalizedHomepageUrl = homepageUrl.trim();
  try {
    normalizedHomepageUrl = new URL(normalizedHomepageUrl).toString();
  } catch {
    return {};
  }

  const homepageCandidates = buildHomepageUrlCandidates(normalizedHomepageUrl);
  let resolvedHomepageUrl: string | undefined;
  let pageText = '';

  for (const candidateUrl of homepageCandidates) {
    try {
      const candidateText = await fetchHomepageTextFromReader(candidateUrl);
      if (!candidateText) continue;
      pageText = candidateText;
      resolvedHomepageUrl = candidateUrl;
      break;
    } catch (error) {
      console.warn(`Homepage fetch failed for ${candidateUrl}:`, error);
    }
  }

  if (!pageText.trim()) return { resolvedHomepageUrl: homepageCandidates[0] };

  const homepageForValidation = resolvedHomepageUrl || homepageCandidates[0];

  const domainCandidates = getDomainCandidates(homepageForValidation, verifiedEmailHint);
  const normalizedPageText = normalizeTextForEmailSearch(pageText);
  const regexCandidates = getEmailCandidatesFromText(pageText);
  const regexEmail = pickBestEmailCandidate(regexCandidates, domainCandidates);
  if (regexEmail) {
    return {
      email: regexEmail,
      resolvedHomepageUrl: homepageForValidation
    };
  }

  try {
    const geminiEmail = await extractEmailWithGeminiFlash(pageText, homepageForValidation, researcherName);
    if (!geminiEmail) return { resolvedHomepageUrl: homepageForValidation };
    if (!normalizedPageText.includes(geminiEmail.toLowerCase())) {
      console.warn(`Discarded unverified Gemini email candidate for ${homepageForValidation}: ${geminiEmail}`);
      return { resolvedHomepageUrl: homepageForValidation };
    }
    return {
      email: pickBestEmailCandidate([geminiEmail], domainCandidates) || geminiEmail,
      resolvedHomepageUrl: homepageForValidation
    };
  } catch (error) {
    console.warn(`Gemini fallback email extraction failed for ${homepageForValidation}:`, error);
    return { resolvedHomepageUrl: homepageForValidation };
  }
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
  userInterests: string,
  options?: LetterGenerationOptions
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
  const professorLastName = researcher.name.split(' ').filter(Boolean).pop() || researcher.name;
  const promptTemplate = options?.promptTemplate?.trim() || DEFAULT_LETTER_GENERATION_PROMPT_TEMPLATE;
  const prompt = renderPromptTemplate(promptTemplate, {
    professor_name: researcher.name,
    professor_last_name: professorLastName,
    student_template: templateWithIntersection,
    user_interests: userInterests || 'N/A',
    researcher_themes: researcherThemes,
    researcher_summary: researcher.interests || 'N/A',
    intersection_keywords: intersectionKeywords || 'None'
  });
  const modelConfig = getLetterModelConfig(options);

  try {
    const response = await ai.models.generateContent({
      model: getLetterModelName(options),
      contents: prompt,
      ...(Object.keys(modelConfig).length > 0 ? { config: modelConfig } : {})
    });

    return response.text || "Failed to generate letter.";

  } catch (error) {
    console.error("Letter generation error:", error);
    throw new Error("Failed to generate customized letter.");
  }
};

/**
 * Refines an existing customized letter using an in-context annotation.
 * Returns the full updated letter body.
 */
export const reviseCustomizedLetterWithAnnotation = async (
  currentLetter: string,
  selectedText: string,
  annotation: string,
  researcher: Researcher,
  userInterests: string,
  options?: LetterRevisionOptions
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is missing.");

  const themeList = (researcher.tags || []).map(t => t.keyword).filter(Boolean);
  const researcherThemes = themeList.join(', ') || 'their research field';
  const matchedInterestList = (researcher.matchedInterests || [])
    .map(i => i.trim())
    .filter(i => i.length > 0);
  const intersectionKeywords = matchedInterestList.length > 0
    ? matchedInterestList.join(', ')
    : themeList.slice(0, 3).join(', ');
  const promptTemplate = options?.promptTemplate?.trim() || DEFAULT_LETTER_REVISION_PROMPT_TEMPLATE;
  const prompt = renderPromptTemplate(promptTemplate, {
    professor_name: researcher.name,
    user_interests: userInterests || 'N/A',
    researcher_themes: researcherThemes,
    intersection_keywords: intersectionKeywords || 'N/A',
    current_letter: currentLetter,
    selected_text: selectedText,
    annotation
  });
  const modelConfig = getLetterModelConfig(options);

  try {
    const response = await ai.models.generateContent({
      model: getLetterModelName(options),
      contents: prompt,
      ...(Object.keys(modelConfig).length > 0 ? { config: modelConfig } : {})
    });

    return response.text || currentLetter;
  } catch (error) {
    console.error("Letter revision error:", error);
    throw new Error("Failed to revise customized letter.");
  }
};
