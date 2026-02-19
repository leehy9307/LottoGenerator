import { LottoDrawResult, StrategyInfo } from '../types/lotto';
import { calculateFrequencies } from './frequencyAnalysis';
import {
  recencyWeightedFrequency,
  calculateMomentum,
  calculateGaps,
  normalizeScores,
} from './trendAnalysis';
import {
  calculateAntiPopularity,
  calculatePairCorrelation,
  distributionEntropyScore,
  analyzeCarryover,
} from './gameTheory';
import { getBallColorGroup } from '../constants/ballColors';

const ALGORITHM_VERSION = '2.0.0';

interface WeightedScore {
  number: number;
  score: number;
  components: {
    frequency: number;
    recency: number;
    momentum: number;
    gap: number;
    temporal: number;
    antiPopularity: number;
    pairCorrelation: number;
    distributionEntropy: number;
  };
}

/**
 * v2.0 8-Factor 가중치 설정
 *
 * [기존 5-Factor v1.0]
 * 빈도 20% + 최근성 20% + 모멘텀 20% + 갭 15% + 시간엔트로피 25%
 *
 * [신규 8-Factor v2.0 — AI + 게임이론 강화]
 * 비인기번호(게임이론)가 최고 가중치 → 당첨 시 기대값 극대화
 * 분포엔트로피로 구간 균형 유도 → 비인기 구간 강화
 * 쌍관계로 LSTM 근사 패턴 반영
 */
const WEIGHTS = {
  frequency:           0.10,  // 출현 빈도 (↓ 20→10: 과거 편향 축소)
  recency:             0.10,  // 최근성 가중 (↓ 20→10)
  momentum:            0.10,  // 모멘텀 (= 유지)
  gap:                 0.08,  // 갭 분석 (↓ 15→8: 도박사의 오류 완화)
  temporal:            0.12,  // 시간 엔트로피 (↓ 25→12: 결정론적 랜덤 축소)
  antiPopularity:      0.25,  // ★ 비인기번호 (NEW: 게임이론 최고 가중치)
  pairCorrelation:     0.10,  // ★ 쌍 상관관계 (NEW: LSTM 근사)
  distributionEntropy: 0.15,  // ★ 분포 엔트로피 (NEW: 구간 균형)
} as const;

// ─── PRNG ─────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createTimeSeed(): number {
  const now = Date.now();
  const d = new Date();
  return (now ^ (d.getMilliseconds() * 65537)
    ^ (d.getSeconds() * 2147483647)
    ^ (d.getMinutes() * 16777259)) >>> 0;
}

// ─── 시간 엔트로피 (v1.0에서 계승, 가중치만 축소) ────────────────

function temporalWeights(now: Date): Map<number, number> {
  const weights = new Map<number, number>();
  const seed = createTimeSeed();
  const rng = mulberry32(seed);

  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const daysToSaturday = (6 - dayOfWeek + 7) % 7 || 7;
  const urgencyFactor = 1 - (daysToSaturday / 7) * 0.3;

  for (let i = 1; i <= 45; i++) {
    const hourResonance = Math.cos((i * hour * Math.PI) / 45) * 0.15;
    const minuteResonance = Math.sin((i * minute * Math.PI) / 90) * 0.1;
    const dayResonance = Math.cos((i * dayOfWeek * Math.PI) / 7) * 0.1;
    const noise = (rng() - 0.5) * 0.3;

    const weight = (hourResonance + minuteResonance + dayResonance + noise) * urgencyFactor;
    weights.set(i, weight);
  }

  return weights;
}

// ─── Expert Pick v2.0: 8-Factor AI 강화 알고리즘 ─────────────────

export interface ExpertPickResult {
  numbers: number[];
  strategy: StrategyInfo;
}

/**
 * Expert Pick v2.0 — 8-Factor AI + 게임이론 앙상블
 *
 * 핵심 변경점 (vs v1.0):
 * 1. 게임이론 비인기번호 최고 가중치 (25%) → 기대값 극대화
 * 2. 쌍 상관관계로 LSTM/Transformer 시퀀스 패턴 근사 (10%)
 * 3. 분포 엔트로피로 구간 균형 강화 (15%) → 비인기 구간(32~45) 강화
 * 4. 이월 분석 + 켈리 기준으로 전략 신뢰도 제공
 * 5. 기존 팩터 가중치 재조정 (과적합 방지)
 */
export function generateExpertPick(
  draws: LottoDrawResult[],
  timestamp?: number,
  carryoverMisses: number = 0,
): ExpertPickResult {
  const now = timestamp ? new Date(timestamp) : new Date();

  // ── 8개 팩터 계산 ──
  // 기존 5개
  const frequencies = calculateFrequencies(draws);
  const recencyScores = recencyWeightedFrequency(draws);
  const momentumScores = calculateMomentum(draws);
  const gapScores = calculateGaps(draws);
  const timeScores = temporalWeights(now);

  // 신규 3개 (게임이론 + AI)
  const antiPopScores = calculateAntiPopularity(draws);
  const pairScores = calculatePairCorrelation(draws);

  // 분포 엔트로피는 번호별 직접 계산
  const distEntropyScores = new Map<number, number>();
  for (let i = 1; i <= 45; i++) {
    distEntropyScores.set(i, distributionEntropyScore(i, draws));
  }

  // ── 정규화 ──
  const freqMap = new Map<number, number>();
  for (const f of frequencies) {
    freqMap.set(f.number, f.count);
  }
  const normFreq = normalizeScores(freqMap);
  const normRecency = normalizeScores(recencyScores);
  const normMomentum = normalizeScores(momentumScores);
  const normGap = normalizeScores(gapScores);
  const normTime = normalizeScores(timeScores);
  const normAntiPop = normalizeScores(antiPopScores);
  const normPair = normalizeScores(pairScores);
  const normDistEntropy = normalizeScores(distEntropyScores);

  // ── 복합 점수 계산 ──
  const scored: WeightedScore[] = [];
  for (let i = 1; i <= 45; i++) {
    const components = {
      frequency: normFreq.get(i) || 0,
      recency: normRecency.get(i) || 0,
      momentum: normMomentum.get(i) || 0,
      gap: normGap.get(i) || 0,
      temporal: normTime.get(i) || 0,
      antiPopularity: normAntiPop.get(i) || 0,
      pairCorrelation: normPair.get(i) || 0,
      distributionEntropy: normDistEntropy.get(i) || 0,
    };

    const composite =
      components.frequency           * WEIGHTS.frequency +
      components.recency             * WEIGHTS.recency +
      components.momentum            * WEIGHTS.momentum +
      components.gap                 * WEIGHTS.gap +
      components.temporal            * WEIGHTS.temporal +
      components.antiPopularity      * WEIGHTS.antiPopularity +
      components.pairCorrelation     * WEIGHTS.pairCorrelation +
      components.distributionEntropy * WEIGHTS.distributionEntropy;

    scored.push({ number: i, score: composite, components });
  }

  scored.sort((a, b) => b.score - a.score);

  // ── 제약조건 기반 선택 ──
  const numbers = selectWithConstraints(scored, now);

  // ── 이월 분석 ──
  const carryover = analyzeCarryover(carryoverMisses);

  // ── 비인기 점수 계산 (선택된 6개의 평균 anti-popularity) ──
  const avgAntiPop = numbers.reduce((sum, n) => sum + (normAntiPop.get(n) || 0), 0) / 6;

  // ── 전략 메타데이터 구성 ──
  const strategy: StrategyInfo = {
    algorithmVersion: ALGORITHM_VERSION,
    factorSummary: '빈도+최근성+모멘텀+갭+시간엔트로피+비인기(게임이론)+쌍관계(AI)+분포엔트로피',
    antiPopularityScore: Math.round(avgAntiPop * 100) / 100,
    expectedValue: carryover.expectedValue,
    recommendation: carryover.recommendation,
    confidenceScore: Math.round(carryover.confidenceScore * 100) / 100,
    carryoverMisses,
    estimatedJackpot: formatKoreanWon(carryover.estimatedJackpot),
  };

  return { numbers, strategy };
}

// ─── 제약조건 선택 (v1.0 계승 + 강화) ────────────────────────────

function selectWithConstraints(scored: WeightedScore[], now: Date): number[] {
  const seed = createTimeSeed();
  const rng = mulberry32(seed);
  const maxAttempts = 300; // v2.0: 200 → 300으로 증가 (강화된 제약조건)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const selected = greedySelect(scored, attempt, rng);
    if (selected && validateConstraints(selected)) {
      return selected.sort((a, b) => a - b);
    }
  }

  return scored
    .slice(0, 6)
    .map(s => s.number)
    .sort((a, b) => a - b);
}

function greedySelect(
  scored: WeightedScore[],
  attempt: number,
  rng: () => number
): number[] | null {
  const selected: number[] = [];
  const candidates = [...scored];

  if (attempt > 0) {
    for (let i = 0; i < candidates.length; i++) {
      const jitter = (rng() - 0.5) * 0.12 * Math.min(attempt / 10, 1);
      candidates[i] = { ...candidates[i], score: candidates[i].score + jitter };
    }
    candidates.sort((a, b) => b.score - a.score);
  }

  for (const candidate of candidates) {
    if (selected.length >= 6) break;

    const testSet = [...selected, candidate.number];
    if (testSet.length === 6) {
      if (validateConstraints(testSet)) {
        selected.push(candidate.number);
      }
    } else {
      selected.push(candidate.number);
    }
  }

  return selected.length === 6 ? selected : null;
}

// ─── 제약조건 검증 (v2.0 강화) ───────────────────────────────────

function validateConstraints(numbers: number[]): boolean {
  // (1) 합계: 100~175 (v1.0 유지)
  const sum = numbers.reduce((a, b) => a + b, 0);
  if (sum < 100 || sum > 175) return false;

  // (2) 홀짝 균형: 최소 2개씩 (v1.0 유지)
  const oddCount = numbers.filter(n => n % 2 === 1).length;
  const evenCount = 6 - oddCount;
  if (oddCount < 2 || evenCount < 2) return false;

  // (3) 고저 균형: 최소 2개씩 (v1.0 유지)
  const lowCount = numbers.filter(n => n <= 22).length;
  const highCount = 6 - lowCount;
  if (lowCount < 2 || highCount < 2) return false;

  // (4) 색상 분포: 최소 3그룹 (v1.0 유지)
  const colorGroups = new Set(numbers.map(n => getBallColorGroup(n)));
  if (colorGroups.size < 3) return false;

  // (5) ★ NEW: 비인기 구간(32~45) 최소 1개 포함
  // 게임이론 핵심: 32~45 영역은 생일 편향 밖 → 분할 확률 감소
  const highZoneCount = numbers.filter(n => n >= 32).length;
  if (highZoneCount < 1) return false;

  // (6) ★ NEW: 끝자리 다양성 최소 4종
  // 같은 끝자리 번호를 고르면 인기 패턴에 겹칠 확률 상승
  const lastDigits = new Set(numbers.map(n => n % 10));
  if (lastDigits.size < 4) return false;

  return true;
}

// ─── 유틸 ────────────────────────────────────────────────────────

function formatKoreanWon(amount: number): string {
  if (amount >= 100_000_000_000) {
    return `${(amount / 100_000_000_000).toFixed(0)}천억원`;
  }
  if (amount >= 100_000_000) {
    return `${(amount / 100_000_000).toFixed(0)}억원`;
  }
  if (amount >= 10_000) {
    return `${(amount / 10_000).toFixed(0)}만원`;
  }
  return `${amount}원`;
}
