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
  consecutivePairPotential,
  analyzeCarryover,
} from './gameTheory';
import { getBallColorGroup } from '../constants/ballColors';

const ALGORITHM_VERSION = '3.0.0';

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
    consecutiveBonus: number;
  };
}

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │  v3.0 Expert-Grade 가중치 — 수학자/게임이론 전문가 해석    │
 * ├─────────────────────────────────────────────────────────────┤
 * │                                                             │
 * │  수학적 사실:                                               │
 * │  ① 모든 조합 확률 = 1/8,145,060 (변경 불가)               │
 * │  ② 추첨은 독립시행 → 과거가 미래를 예측하지 못함           │
 * │  ③ 유일한 수학적 에지 = 당첨 시 기대 수령액 극대화         │
 * │     E(수령) = P(당첨) × 잭팟 / 동일번호선택자수            │
 * │     P(당첨) 고정 → "동일번호선택자수" 최소화가 핵심        │
 * │                                                             │
 * │  팩터 분류:                                                 │
 * │  [Tier 1] 게임이론 — 기대값에 직접 영향 (55%)              │
 * │  [Tier 2] 품질 랜덤화 — 다양성 확보 (20%)                  │
 * │  [Tier 3] 통계 패턴 — 보조 신호 (25%)                      │
 * │    (예측력은 없으나 다양한 조합 생성에 기여)                │
 * │                                                             │
 * └─────────────────────────────────────────────────────────────┘
 */
const WEIGHTS = {
  // ── Tier 1: 게임이론 (55%) — 기대값 직접 영향 ──
  antiPopularity:      0.28,  // 비인기번호 선호 (Nash Equilibrium 기반)
  distributionEntropy: 0.15,  // 구간 분산 (비인기 구간 강화)
  consecutiveBonus:    0.12,  // 연속번호 보너스 (사람들이 기피 → 분할 감소)

  // ── Tier 2: 품질 랜덤화 (20%) — 매회 다른 조합 ──
  temporal:            0.20,  // 시간 엔트로피 (PRNG 기반 탐색)

  // ── Tier 3: 통계 패턴 (25%) — 보조 신호 ──
  pairCorrelation:     0.10,  // 쌍 상관관계 (LSTM 경량 근사)
  frequency:           0.05,  // 출현 빈도 (약한 보조)
  recency:             0.04,  // 최근성 (약한 보조)
  momentum:            0.03,  // 모멘텀 (약한 보조)
  gap:                 0.03,  // 갭 분석 (약한 보조 — 도박사의 오류 경계)
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

// ─── 시간 엔트로피 ───────────────────────────────────────────────

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

// ─── Expert Pick v3.0 ────────────────────────────────────────────

export interface ExpertPickResult {
  numbers: number[];
  strategy: StrategyInfo;
}

/**
 * Expert Pick v3.0 — 전문가 해석 기반 최적 알고리즘
 *
 * 핵심 변경 (vs v2.0.1):
 * 1. 게임이론 팩터 55%로 대폭 강화 (기대값 최대화 집중)
 * 2. 연속번호 보너스 신규 통합 (사람들이 기피 → 분할 확률↓)
 * 3. 빈도/최근성/모멘텀/갭을 보조 수준으로 격하 (예측력 없음)
 * 4. Temperature 기반 가중 샘플링 (다양성과 전략성 균형)
 * 5. 조합 수준 인기 패턴 검출 (등차수열, 동일대역 등 차단)
 */
export function generateExpertPick(
  draws: LottoDrawResult[],
  timestamp?: number,
  carryoverMisses: number = 0,
): ExpertPickResult {
  const now = timestamp ? new Date(timestamp) : new Date();

  // ── 9개 팩터 계산 ──
  const frequencies = calculateFrequencies(draws);
  const recencyScores = recencyWeightedFrequency(draws);
  const momentumScores = calculateMomentum(draws);
  const gapScores = calculateGaps(draws);
  const timeScores = temporalWeights(now);
  const antiPopScores = calculateAntiPopularity(draws);
  const pairScores = calculatePairCorrelation(draws);

  const distEntropyScores = new Map<number, number>();
  const consecutiveScores = new Map<number, number>();
  for (let i = 1; i <= 45; i++) {
    distEntropyScores.set(i, distributionEntropyScore(i, draws));
    consecutiveScores.set(i, consecutivePairPotential(i, draws));
  }

  // ── 정규화 ──
  const freqMap = new Map<number, number>();
  for (const f of frequencies) {
    freqMap.set(f.number, f.count);
  }
  const norm = {
    freq: normalizeScores(freqMap),
    recency: normalizeScores(recencyScores),
    momentum: normalizeScores(momentumScores),
    gap: normalizeScores(gapScores),
    time: normalizeScores(timeScores),
    antiPop: normalizeScores(antiPopScores),
    pair: normalizeScores(pairScores),
    distEntropy: normalizeScores(distEntropyScores),
    consecutive: normalizeScores(consecutiveScores),
  };

  // ── 복합 점수 ──
  const scored: WeightedScore[] = [];
  for (let i = 1; i <= 45; i++) {
    const c = {
      frequency: norm.freq.get(i) || 0,
      recency: norm.recency.get(i) || 0,
      momentum: norm.momentum.get(i) || 0,
      gap: norm.gap.get(i) || 0,
      temporal: norm.time.get(i) || 0,
      antiPopularity: norm.antiPop.get(i) || 0,
      pairCorrelation: norm.pair.get(i) || 0,
      distributionEntropy: norm.distEntropy.get(i) || 0,
      consecutiveBonus: norm.consecutive.get(i) || 0,
    };

    const composite =
      c.antiPopularity      * WEIGHTS.antiPopularity +
      c.distributionEntropy * WEIGHTS.distributionEntropy +
      c.consecutiveBonus    * WEIGHTS.consecutiveBonus +
      c.temporal            * WEIGHTS.temporal +
      c.pairCorrelation     * WEIGHTS.pairCorrelation +
      c.frequency           * WEIGHTS.frequency +
      c.recency             * WEIGHTS.recency +
      c.momentum            * WEIGHTS.momentum +
      c.gap                 * WEIGHTS.gap;

    scored.push({ number: i, score: composite, components: c });
  }

  scored.sort((a, b) => b.score - a.score);

  // ── 선택 ──
  const numbers = selectWithConstraints(scored);

  // ── 전략 메타데이터 ──
  const carryover = analyzeCarryover(carryoverMisses);
  const avgAntiPop = numbers.reduce((sum, n) => sum + (norm.antiPop.get(n) || 0), 0) / 6;

  const strategy: StrategyInfo = {
    algorithmVersion: ALGORITHM_VERSION,
    factorSummary: '게임이론55%(비인기+분포+연속) + 랜덤20% + 패턴25%',
    antiPopularityScore: Math.round(avgAntiPop * 100) / 100,
    expectedValue: carryover.expectedValue,
    recommendation: carryover.recommendation,
    confidenceScore: Math.round(carryover.confidenceScore * 100) / 100,
    carryoverMisses,
    estimatedJackpot: formatKoreanWon(carryover.estimatedJackpot),
  };

  return { numbers, strategy };
}

// ─── Temperature 기반 가중 샘플링 ────────────────────────────────

/**
 * Temperature 파라미터:
 *   T < 1.0 → 점수 높은 번호에 집중 (deterministic)
 *   T = 1.0 → 점수에 비례 (proportional)
 *   T > 1.0 → 더 균일하게 분산 (exploratory)
 *
 * 전문가 설정: T = 1.8
 *   → 상위 번호를 약간 선호하되, 전 구간에서 고르게 뽑힘
 *   → 너무 deterministic하면 매번 비슷한 조합 (비인기 효과 감소)
 *   → 너무 random하면 게임이론 효과 소멸
 */
const TEMPERATURE = 1.8;

function selectWithConstraints(scored: WeightedScore[]): number[] {
  const seed = createTimeSeed();
  const rng = mulberry32(seed);

  // 1차: Temperature 기반 가중 샘플링
  for (let attempt = 0; attempt < 500; attempt++) {
    const selected = temperatureSample(scored, rng, TEMPERATURE);
    if (validateConstraints(selected) && validateCombinationAntiPopularity(selected)) {
      return selected.sort((a, b) => a - b);
    }
  }

  // 2차: 구간 보장 폴백
  return zoneFallback(scored, rng);
}

function temperatureSample(
  scored: WeightedScore[],
  rng: () => number,
  temperature: number
): number[] {
  const selected: number[] = [];
  const remaining = [...scored];

  for (let pick = 0; pick < 6; pick++) {
    // Temperature-scaled softmax
    const minScore = Math.min(...remaining.map(s => s.score));
    const scaled = remaining.map(s =>
      Math.pow(s.score - minScore + 0.01, 1 / temperature)
    );
    const totalWeight = scaled.reduce((sum, w) => sum + w, 0);

    let r = rng() * totalWeight;
    let chosenIdx = 0;
    for (let i = 0; i < scaled.length; i++) {
      r -= scaled[i];
      if (r <= 0) {
        chosenIdx = i;
        break;
      }
    }

    selected.push(remaining[chosenIdx].number);
    remaining.splice(chosenIdx, 1);
  }

  return selected;
}

function zoneFallback(scored: WeightedScore[], rng: () => number): number[] {
  const zones: WeightedScore[][] = [[], [], [], [], []];
  for (const s of scored) {
    const zone = s.number >= 40 ? 4 : Math.floor((s.number - 1) / 10);
    zones[zone].push(s);
  }
  for (const zone of zones) {
    zone.sort((a, b) => b.score - a.score);
  }

  const selected: number[] = [];
  const used = new Set<number>();

  const lowPool = [...zones[0], ...zones[1], ...zones[2].filter(s => s.number <= 22)];
  const highPool = [...zones[2].filter(s => s.number >= 23), ...zones[3], ...zones[4]];
  lowPool.sort((a, b) => b.score - a.score);
  highPool.sort((a, b) => b.score - a.score);

  for (const s of lowPool) {
    if (selected.length >= 2) break;
    selected.push(s.number);
    used.add(s.number);
  }

  const high32 = highPool.filter(s => s.number >= 32);
  if (high32.length > 0) {
    selected.push(high32[0].number);
    used.add(high32[0].number);
  }
  for (const s of highPool) {
    if (selected.length >= 4) break;
    if (used.has(s.number)) continue;
    selected.push(s.number);
    used.add(s.number);
  }

  const rest = scored.filter(s => !used.has(s.number));
  rest.sort((a, b) => b.score - a.score);
  for (const s of rest) {
    if (selected.length >= 6) break;
    selected.push(s.number);
  }

  return selected.sort((a, b) => a - b);
}

// ─── 제약조건: 개별 번호 수준 ────────────────────────────────────

function validateConstraints(numbers: number[]): boolean {
  const sum = numbers.reduce((a, b) => a + b, 0);
  if (sum < 100 || sum > 175) return false;

  const oddCount = numbers.filter(n => n % 2 === 1).length;
  if (oddCount < 2 || oddCount > 4) return false;

  const lowCount = numbers.filter(n => n <= 22).length;
  if (lowCount < 2 || lowCount > 4) return false;

  const colorGroups = new Set(numbers.map(n => getBallColorGroup(n)));
  if (colorGroups.size < 3) return false;

  if (numbers.filter(n => n >= 32).length < 1) return false;

  const lastDigits = new Set(numbers.map(n => n % 10));
  if (lastDigits.size < 4) return false;

  return true;
}

// ─── 제약조건: 조합 수준 인기 패턴 차단 ─────────────────────────

/**
 * 조합 자체가 "인기 패턴"인지 검출
 * 사람들이 즐겨 쓰는 조합 패턴을 회피하여 분할 위험을 감소
 *
 * 차단 패턴:
 * 1. 등차수열 (5,10,15,20,25,30)
 * 2. 동일 10단위대에 4개 이상 (31,32,34,35,37,39)
 * 3. 전부 홀수 또는 전부 짝수 (이미 위에서 차단)
 * 4. 연번 3개 이상 연속 (11,12,13 → 사람들이 의외로 많이 선택)
 */
function validateCombinationAntiPopularity(numbers: number[]): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);

  // (1) 등차수열 검출: 6개가 일정 간격이면 차단
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    diffs.push(sorted[i] - sorted[i - 1]);
  }
  const allSameDiff = diffs.every(d => d === diffs[0]);
  if (allSameDiff) return false;

  // (2) 동일 10단위대 4개 이상 차단
  const decades = new Map<number, number>();
  for (const n of sorted) {
    const dec = Math.floor((n - 1) / 10);
    decades.set(dec, (decades.get(dec) || 0) + 1);
  }
  for (const count of decades.values()) {
    if (count >= 4) return false;
  }

  // (3) 3개 이상 연속번호 차단 (인기 패턴)
  let consecutiveRun = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      consecutiveRun++;
      if (consecutiveRun >= 3) return false;
    } else {
      consecutiveRun = 1;
    }
  }

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
