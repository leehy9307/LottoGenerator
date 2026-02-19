export interface LottoDrawResult {
  drawNo: number;
  date: string;
  numbers: number[];  // 6 main numbers sorted
  bonus: number;
}

export interface NumberFrequency {
  number: number;
  count: number;
  percentage: number;
}

export interface StrategyInfo {
  algorithmVersion: string;
  factorSummary: string;           // 사용된 팩터 요약
  antiPopularityScore: number;     // 비인기 점수 (0~1, 높을수록 좋음)
  expectedValue: number;           // 기대값 (원)
  recommendation: 'strong_buy' | 'buy' | 'neutral' | 'skip';
  confidenceScore: number;         // 전략 신뢰도 (0~1)
  carryoverMisses: number;         // 이월 횟수 (0=이월 없음)
  estimatedJackpot: string;        // 추정 1등 당첨금 (표시용)
}

export interface AnalysisResult {
  hotNumbers: NumberFrequency[];   // Top 6 most frequent
  coldNumbers: NumberFrequency[];  // Bottom 6 least frequent
  expertPick: number[];            // 6 expert-recommended numbers
  allFrequencies: NumberFrequency[];
  totalDraws: number;
  drawRange: { from: number; to: number };
  chiSquareP: number;
  isUniform: boolean;
  generatedAt: number;             // timestamp of generation
  nextDrawNo: number;              // 다음 추첨 회차
  strategy: StrategyInfo;          // v2.0 전략 메타데이터
}

export interface AppState {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  analysis: AnalysisResult | null;
  dataSource: 'github' | 'api' | 'cache' | 'fallback';
}
