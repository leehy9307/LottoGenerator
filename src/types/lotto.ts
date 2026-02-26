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
  factorSummary: string;
  populationAvoidanceScore: number;  // 비인기 점수 (0~1)
  structuralFitScore: number;        // 구조 적합도 (0~1)
  mcmcConvergence: number;           // R-hat (< 1.1 = 수렴)
  expectedValue: number;             // 세후 기대값 (원)
  expectedValueBreakdown: {          // 등수별 EV
    ev3: number; ev4: number; ev5: number;
  };
  estimatedCoWinners: number;        // 추정 공동당첨자
  recommendation: 'strong_buy' | 'buy' | 'neutral' | 'skip';
  reasoning: string;                 // 추천 이유 (한국어)
  confidenceScore: number;           // MCMC 수렴 기반 신뢰도
  carryoverMisses: number;
  estimatedJackpot: string;
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
