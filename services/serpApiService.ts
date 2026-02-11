const SERP_API_KEY = import.meta.env.VITE_SERP_API_KEY || '';

export interface ScholarPublication {
  title: string;
  authors?: string;
  year?: string;
  citation?: string;
  cited_by?: {
    value: number;
  };
}

export interface ScholarAuthorData {
  name: string;
  affiliations?: string;
  articles: ScholarPublication[];
  cited_by?: {
    table: Array<{ citations: { all: number } }>;
  };
  thumbnail?: string;
}

export interface ScholarAuthorCandidate {
  name: string;
  authorId: string;
  link?: string;
  affiliations?: string;
  email?: string;
  citedBy?: number;
}

/**
 * Fetches publications for a given Google Scholar author ID using SerpAPI
 * @param authorId - The Scholar author ID (e.g., "LSsXyncAAAAJ")
 * @returns Author data including up to 200 publications
 */
export async function fetchScholarPublications(authorId: string): Promise<ScholarAuthorData> {
  if (!SERP_API_KEY) {
    throw new Error('SERP_API_KEY is not configured in .env.local');
  }

  // Use Vite dev proxy to avoid CORS issues
  const params = new URLSearchParams({
    engine: 'google_scholar_author',
    author_id: authorId,
    num: '50',
    sort: 'pubdate'
    // API key will be added by the proxy
  });

  const url = `/api/serpapi?${params.toString()}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`SerpAPI request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`SerpAPI error: ${data.error}`);
    }

    const thumbnail = data.author?.thumbnail;
    const isDefaultAvatar = thumbnail?.includes('avatar_scholar_128.png');

    return {
      name: data.author?.name || 'Unknown',
      affiliations: data.author?.affiliations || '',
      articles: data.articles || [],
      cited_by: data.cited_by,
      thumbnail: isDefaultAvatar ? undefined : thumbnail
    };

  } catch (error: any) {
    console.error('SerpAPI fetch error:', error);
    throw new Error(`Failed to fetch publications: ${error.message}`);
  }
}

/**
 * Searches Google Scholar and extracts up to 3 candidate author profiles.
 * Uses the general google_scholar endpoint and reads `profiles.authors`.
 */
export async function searchScholarAuthorCandidates(name: string, university?: string): Promise<ScholarAuthorCandidate[]> {
  if (!SERP_API_KEY) {
    throw new Error('SERP_API_KEY is not configured in .env.local');
  }

  const query = [name, university].map(s => (s || '').trim()).filter(Boolean).join(' ');
  if (!query) return [];

  const params = new URLSearchParams({
    engine: 'google_scholar',
    q: query,
    hl: 'en'
  });

  const url = `/api/serpapi?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`SerpAPI request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`SerpAPI error: ${data.error}`);
    }

    const authors = Array.isArray(data?.profiles?.authors) ? data.profiles.authors : [];
    return authors
      .filter((author: any) => author?.author_id && author?.name)
      .slice(0, 3)
      .map((author: any) => ({
        name: author.name,
        authorId: author.author_id,
        link: author.link,
        affiliations: author.affiliations,
        email: author.email,
        citedBy: typeof author.cited_by === 'number' ? author.cited_by : undefined
      }));
  } catch (error: any) {
    console.error('SerpAPI candidate search error:', error);
    throw new Error(`Failed to search scholar candidates: ${error.message}`);
  }
}

/**
 * Generates Google Scholar author search URL with researcher ID parameter
 * @param name - Researcher name
 * @param researcherId - Unique researcher ID for extension integration
 */
export function generateScholarSearchUrl(name: string, researcherId: string, university?: string): string {
  const rawQuery = [name, university].map(s => (s || '').trim()).filter(Boolean).join(' ');
  const query = encodeURIComponent(rawQuery || name);
  return `https://scholar.google.com/citations?hl=en&view_op=search_authors&mauthors=${query}&researcher_id=${researcherId}`;
}
