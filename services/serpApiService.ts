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
    num: '200'
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

    return {
      name: data.author?.name || 'Unknown',
      affiliations: data.author?.affiliations || '',
      articles: data.articles || [],
      cited_by: data.cited_by
    };

  } catch (error: any) {
    console.error('SerpAPI fetch error:', error);
    throw new Error(`Failed to fetch publications: ${error.message}`);
  }
}

/**
 * Generates Google Scholar author search URL with researcher ID parameter
 * @param name - Researcher name
 * @param researcherId - Unique researcher ID for extension integration
 */
export function generateScholarSearchUrl(name: string, researcherId: string): string {
  const query = encodeURIComponent(name);
  return `https://scholar.google.com/citations?hl=en&view_op=search_authors&mauthors=${query}&researcher_id=${researcherId}`;
}
