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

export interface PatternDetailScores {
  markov: number;           // 마르코프 전이 점수 (0~1)
  dormancy: number;         // 휴면 각성 점수 (0~1)
  momentum: number;         // 모멘텀 점수 (-1~1)
  pair: number;             // 페어 친화도 점수 (0~1)
  awakeningNumbers: number[];  // 각성 임박 번호
  risingNumbers: number[];     // 상승 추세 번호
}

export interface StrategyInfo {
  algorithmVersion: string;
  engine?: 'ev-optimized' | 'pattern';  // v10.0: 듀얼 엔진 구분
  factorSummary: string;
  populationAvoidanceScore: number;  // 비인기 점수 (0~1)
  structuralFitScore: number;        // 구조 적합도 (0~1)
  patternIntelligenceScore?: number; // v9.0+: 패턴 지능 점수 (0~1)
  patternDetails?: PatternDetailScores; // v9.0+: 패턴 세부 분석
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

export interface ExpertPickGame {
  numbers: number[];
  strategy: StrategyInfo;
}

export interface AnalysisResult {
  hotNumbers: NumberFrequency[];   // Top 6 most frequent
  coldNumbers: NumberFrequency[];  // Bottom 6 least frequent
  expertPick: number[];            // 1st game numbers (backward compat)
  expertPicks: ExpertPickGame[];   // All 5 games
  allFrequencies: NumberFrequency[];
  totalDraws: number;
  drawRange: { from: number; to: number };
  chiSquareP: number;
  isUniform: boolean;
  generatedAt: number;             // timestamp of generation
  nextDrawNo: number;              // 다음 추첨 회차
  strategy: StrategyInfo;          // 1st game strategy (backward compat)
}

export interface AppState {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  analysis: AnalysisResult | null;
  dataSource: 'github' | 'api' | 'cache' | 'fallback';
}
