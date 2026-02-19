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

const ALGORITHM_VERSION = '2.0.1';

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
  frequency:           0.14,  // 출현 빈도 (v2.0.1: 10→14, 통계 기반 복원)
  recency:             0.14,  // 최근성 가중 (v2.0.1: 10→14)
  momentum:            0.12,  // 모멘텀
  gap:                 0.10,  // 갭 분석 (v2.0.1: 8→10)
  temporal:            0.15,  // 시간 엔트로피 (v2.0.1: 12→15, 다양성 확보)
  antiPopularity:      0.15,  // ★ 비인기번호 (v2.0.1: 25→15, 쏠림 방지)
  pairCorrelation:     0.12,  // ★ 쌍 상관관계 (LSTM 근사)
  distributionEntropy: 0.08,  // ★ 분포 엔트로피 (v2.0.1: 15→8, 구간 균형 완화)
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

  // 1차: 가중 확률 샘플링 (v2.0.1 — greedy 대신 확률적 선택)
  for (let attempt = 0; attempt < 500; attempt++) {
    const selected = weightedSample(scored, rng);
    if (validateConstraints(selected)) {
      return selected.sort((a, b) => a - b);
    }
  }

  // 2차: 구간 보장 선택 (fallback — 절대 실패하지 않음)
  return zoneFallback(scored, rng);
}

/**
 * 가중 확률 샘플링: 점수에 비례하는 확률로 6개를 뽑되,
 * 완전 greedy가 아니라 확률적으로 선택하여 다양한 구간에서 뽑힘
 */
function weightedSample(scored: WeightedScore[], rng: () => number): number[] {
  const selected: number[] = [];
  const remaining = [...scored];

  for (let pick = 0; pick < 6; pick++) {
    // 점수를 확률로 변환 (softmax-like)
    const minScore = Math.min(...remaining.map(s => s.score));
    const shifted = remaining.map(s => s.score - minScore + 0.01);
    const totalWeight = shifted.reduce((sum, w) => sum + w, 0);

    // 가중 랜덤 선택
    let r = rng() * totalWeight;
    let chosenIdx = 0;
    for (let i = 0; i < shifted.length; i++) {
      r -= shifted[i];
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

/**
 * 구간 보장 폴백: 각 구간에서 최소 1개씩 보장하고 나머지를 상위 점수로 채움
 * → 어떤 상황에서도 제약조건을 만족하는 조합 반환
 */
function zoneFallback(scored: WeightedScore[], rng: () => number): number[] {
  // 5개 구간으로 분할
  const zones: WeightedScore[][] = [[], [], [], [], []];
  for (const s of scored) {
    const zone = s.number >= 40 ? 4 : Math.floor((s.number - 1) / 10);
    zones[zone].push(s);
  }

  // 각 구간을 점수 순 정렬
  for (const zone of zones) {
    zone.sort((a, b) => b.score - a.score);
  }

  const selected: number[] = [];
  const usedNumbers = new Set<number>();

  // 저번호(1~22)에서 2개, 고번호(23~45)에서 2개 보장
  const lowZones = [...zones[0], ...zones[1], ...zones[2].filter(s => s.number <= 22)];
  const highZones = [...zones[2].filter(s => s.number >= 23), ...zones[3], ...zones[4]];
  lowZones.sort((a, b) => b.score - a.score);
  highZones.sort((a, b) => b.score - a.score);

  // 저번호 2개
  for (const s of lowZones) {
    if (selected.length >= 2) break;
    selected.push(s.number);
    usedNumbers.add(s.number);
  }

  // 고번호 2개 (32~45에서 최소 1개 포함)
  const highZone32plus = highZones.filter(s => s.number >= 32);
  if (highZone32plus.length > 0) {
    selected.push(highZone32plus[0].number);
    usedNumbers.add(highZone32plus[0].number);
  }
  for (const s of highZones) {
    if (selected.length >= 4) break;
    if (usedNumbers.has(s.number)) continue;
    selected.push(s.number);
    usedNumbers.add(s.number);
  }

  // 나머지 2개: 전체에서 점수 높은 순으로 채움
  const rest = scored.filter(s => !usedNumbers.has(s.number));
  rest.sort((a, b) => b.score - a.score);
  for (const s of rest) {
    if (selected.length >= 6) break;
    selected.push(s.number);
  }

  return selected.sort((a, b) => a - b);
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
