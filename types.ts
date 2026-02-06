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

export enum MatchType {
  NONE = 'NONE',
  LOW = 'LOW',         // Exactly 2 matches
  PARTIAL = 'PARTIAL', // 3+ matches (but < 80%)
  HIGH = 'HIGH'        // >= 80% matches
}

export enum EmailStatus {
  NOT_SENT = 'NOT_SENT',
  SENT = 'SENT'
}

export interface Researcher {
  id: string;
  name: string;
  status: AnalysisStatus;
  scholarAuthorId?: string;
  interests?: string;
  tags?: KeywordEvidence[]; // Enhanced with evidence
  profileUrl?: string;
  avatarUrl?: string;
  isMatch?: boolean;
  matchType?: MatchType;
  matchReason?: string;
  isFavorite?: boolean;
  customizedLetter?: string;
  emailStatus?: EmailStatus;
}

export interface AnalysisResult {
  summary: string;
  keywords: KeywordEvidence[]; // Enhanced with evidence
  isMatch: boolean;
  matchType?: MatchType;
  matchReason?: string;
}