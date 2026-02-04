export enum AnalysisStatus {
  PENDING = 'PENDING',
  AWAITING_SCHOLAR_ID = 'AWAITING_SCHOLAR_ID',
  LOADING = 'LOADING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface KeywordEvidence {
  keyword: string;
  reasoning: string;
  supportingPapers: Array<{
    title: string;
    year?: string;
    citations?: number;
  }>;
}

export interface Researcher {
  id: string;
  name: string;
  status: AnalysisStatus;
  scholarAuthorId?: string;
  interests?: string;
  tags?: KeywordEvidence[]; // Enhanced with evidence
  profileUrl?: string;
  isMatch?: boolean;
  matchReason?: string;
}

export interface AnalysisResult {
  summary: string;
  keywords: KeywordEvidence[]; // Enhanced with evidence
  url?: string;
  isMatch: boolean;
  matchReason?: string;
}