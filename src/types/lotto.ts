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
}

export interface AppState {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  analysis: AnalysisResult | null;
  dataSource: 'api' | 'cache' | 'fallback';
}
