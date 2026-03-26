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
  engine?: 'ev-optimized' | 'pattern' | 'hybrid';  // v11.0: 트리플 엔진
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
  // v11.0: 하이브리드 파이프라인 메타데이터
  hybridPipelineScore?: number;       // 하이브리드 융합 점수 (0~1)
  randomnessVerdict?: string;         // NIST 난수성 판정
  prngDetected?: boolean;             // PRNG 탐지 여부
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
  // v11.0: 하이브리드 파이프라인 결과
  hybridPipeline?: HybridPipelineResult;
}

// ============================================================
// v11.0: NIST 난수성 검증 타입
// ============================================================

export interface NistTestResult {
  testName: string;
  pValue: number;
  passed: boolean;       // pValue >= 0.01
  statistic: number;
}

export interface NistSuiteResult {
  tests: NistTestResult[];
  passedCount: number;
  totalTests: number;
  proportionPassed: number;
  pValueUniformity: number;  // KS 검정 p-value
  verdict: 'random' | 'suspicious' | 'non-random';
  bitLength: number;
}

// ============================================================
// v11.0: PRNG 탐지 타입
// ============================================================

export interface LCGDetectionResult {
  detected: boolean;
  confidence: number;
  parameters?: { a: number; c: number; m: number };
  predictedNext?: number;
}

export interface TruncatedLCGResult {
  detected: boolean;
  confidence: number;
  suspectedModulus?: number;
}

export interface LFSRDetectionResult {
  detected: boolean;
  confidence: number;
  linearComplexity: number;
  sequenceLength: number;
  ratio: number;           // complexity / sequenceLength
  polynomial?: number[];
}

export interface MTDetectionResult {
  feasible: false;
  reason: string;
  partialAnalysis: {
    mod3Distribution: number[];
    mod5Distribution: number[];
    mod7Distribution: number[];
    uniformityScore: number;
  };
}

export interface AutocorrelationResult {
  correlations: { lag: number; value: number; significant: boolean }[];
  detectedPeriod: number | null;
  maxCorrelation: number;
}

export interface SpectralTestResult {
  dimensions: { dim: number; normalizedScore: number; quality: string }[];
  overallScore: number;
}

export interface PRNGDetectionResult {
  lcg: LCGDetectionResult;
  truncatedLcg: TruncatedLCGResult;
  lfsr: LFSRDetectionResult;
  mersenneTwister: MTDetectionResult;
  autocorrelation: AutocorrelationResult;
  spectral: SpectralTestResult;
  verdict: 'none_detected' | 'lcg_suspected' | 'lfsr_suspected' | 'periodic_detected' | 'unknown_structure';
  confidence: number;
  predictable: boolean;
  nextPrediction?: number[];
}

// ============================================================
// v11.0: ML 예측 타입
// ============================================================

export interface MLModelPrediction {
  probabilities: number[];  // 45개 번호별 확률
  top6: number[];           // 상위 6개 예측 번호
  confidence: number;       // 모델 신뢰도 (0~1)
}

export interface MLPredictionData {
  modelVersion: string;
  generatedAt: string;      // ISO timestamp
  basedOnDraw: number;
  predictions: {
    lstm: MLModelPrediction;
    transformer: MLModelPrediction;
    ensemble: MLModelPrediction;
  };
}

// ============================================================
// v11.0: 하이브리드 파이프라인 타입
// ============================================================

export interface HybridWeights {
  prngMath: number;    // PRNG 수학적 예측 가중치
  ml: number;          // ML 모델 가중치
  pattern: number;     // 패턴 엔진 가중치
  structural: number;  // 구조적합도 가중치
}

export interface HybridPipelineResult {
  nistResult: NistSuiteResult;
  prngResult: PRNGDetectionResult;
  mlPredictions: MLPredictionData | null;
  fusionWeights: HybridWeights;
  numberScores: Record<number, number>;  // 번호별 융합 점수 (1~45)
  pipelineVerdict: string;               // 종합 판정 (한국어)
  randomnessClassification: 'truly_random' | 'weakly_structured' | 'prng_detected';
}

export interface AppState {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  analysis: AnalysisResult | null;
  dataSource: 'github' | 'api' | 'cache' | 'fallback';
}
