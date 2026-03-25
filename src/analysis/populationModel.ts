import { LottoDrawResult } from '../types/lotto';
import { WeightedDraw } from './dataWindowing';

/**
 * Population Model v7.0 — Advanced Adversarial Human Bias Engine
 *
 * Models how Korean lotto players choose numbers,
 * producing a 45-dimensional unpopularity vector.
 *
 * 12 cognitive bias sources with research-calibrated weights.
 * Uses softmax normalization for better scaling.
 * Combination-level score uses geometric mean + pattern penalty.
 */

// ─── 12 Bias Sources ─────────────────────────────────────────────

interface BiasConfig {
  name: string;
  weight: number;
  compute: (num: number, draws: LottoDrawResult[]) => number;
}

const BIASES: BiasConfig[] = [
  // (1) Birthday bias: 1-12 months (strong), 13-31 days (moderate)
  // Research: ~30% of manual players use birthday-related numbers
  {
    name: 'birthday',
    weight: 0.20,
    compute: (n) => {
      if (n <= 12) return 0.10;  // month numbers — very popular
      if (n <= 31) return 0.05;  // day numbers — moderately popular
      return 0;                   // 32-45 — rarely chosen by birthday players
    },
  },
  // (2) Lucky/symbolic numbers (culture-universal)
  {
    name: 'lucky',
    weight: 0.12,
    compute: (n) => {
      const lucky: Record<number, number> = {
        7: 0.08, 3: 0.05, 1: 0.04, 13: 0.03,
        17: 0.04, 27: 0.03, 37: 0.02,
        23: 0.02, 33: 0.01, 43: 0.01,
        11: 0.03, 21: 0.02, 31: 0.02,
      };
      return lucky[n] || 0;
    },
  },
  // (3) Korean cultural bias: tetraphobia (4=death), 8=prosperity
  {
    name: 'korean_culture',
    weight: 0.10,
    compute: (n) => {
      // Numbers containing 4: avoided → less popular → GOOD for us
      if (n === 4 || n === 14 || n === 24 || n === 34 || n === 44) return -0.04;
      // Numbers containing 8: preferred → more popular → BAD for us
      if (n === 8 || n === 18 || n === 28 || n === 38) return 0.03;
      // Number 9: 구 sounds like 구복(blessing)
      if (n === 9 || n === 19 || n === 29 || n === 39) return 0.01;
      return 0;
    },
  },
  // (4) Lotto slip visual pattern bias
  // Korean lotto slip: 7 columns × ~7 rows
  // People prefer top-left area and center columns
  {
    name: 'slip_visual',
    weight: 0.08,
    compute: (n) => {
      const row = Math.ceil(n / 7);
      const col = ((n - 1) % 7) + 1;
      let bias = 0;
      // Top rows preferred (row 1-3)
      if (row <= 2) bias += 0.03;
      else if (row <= 3) bias += 0.015;
      // Center columns preferred (3-5)
      if (col >= 3 && col <= 5) bias += 0.015;
      // Corner positions slightly preferred
      if ((row === 1 || row === 7) && (col === 1 || col === 7)) bias += 0.01;
      return bias;
    },
  },
  // (5) Round/neat numbers preference
  {
    name: 'round_numbers',
    weight: 0.06,
    compute: (n) => {
      if (n % 10 === 0) return 0.04;  // 10, 20, 30, 40
      if (n % 5 === 0) return 0.02;   // 5, 15, 25, 35, 45
      return 0;
    },
  },
  // (6) Recent winning number mimicry (recency bias)
  // People tend to choose recently drawn numbers
  {
    name: 'recency',
    weight: 0.10,
    compute: (n, draws) => {
      const sorted = [...draws].sort((a, b) => b.drawNo - a.drawNo);
      const recent = sorted.slice(0, 15);
      let score = 0;
      for (let i = 0; i < recent.length; i++) {
        if (recent[i].numbers.includes(n)) {
          score += 0.012 * Math.exp(-0.15 * i);
        }
        // Bonus number also creates recency bias (shown prominently)
        if (recent[i].bonus === n) {
          score += 0.006 * Math.exp(-0.15 * i);
        }
      }
      return score;
    },
  },
  // (7) Arithmetic sequence affinity
  // People love multiples (5, 10, 15... or 7, 14, 21...)
  {
    name: 'arithmetic',
    weight: 0.06,
    compute: (n) => {
      let bias = 0;
      if (n % 5 === 0) bias += 0.015;
      if (n % 7 === 0) bias += 0.01;
      if (n % 3 === 0) bias += 0.005;
      return bias;
    },
  },
  // (8) Low-number familiarity (anchoring bias)
  // People are more familiar with smaller numbers
  {
    name: 'low_number',
    weight: 0.08,
    compute: (n) => {
      if (n <= 10) return 0.04;
      if (n <= 20) return 0.02;
      if (n <= 30) return 0.01;
      return 0;
    },
  },
  // (9) Diagonal/geometric patterns on slip
  // People draw lines, crosses, zigzags on the slip
  // Numbers on common diagonals get extra popularity
  {
    name: 'diagonal_pattern',
    weight: 0.05,
    compute: (n) => {
      // Main diagonal: 1, 9, 17, 25, 33, 41 (top-left to bottom-right)
      const mainDiag = [1, 9, 17, 25, 33, 41];
      // Anti diagonal: 7, 13, 19, 25, 31, 37 (top-right to bottom-left)
      const antiDiag = [7, 13, 19, 25, 31, 37];
      // Vertical center column: 4, 11, 18, 25, 32, 39
      const centerCol = [4, 11, 18, 25, 32, 39];

      if (mainDiag.includes(n)) return 0.02;
      if (antiDiag.includes(n)) return 0.02;
      if (centerCol.includes(n)) return 0.015;
      return 0;
    },
  },
  // (10) "Hot number" chasing — gambler's fallacy variant
  // Frequent numbers in all-time stats get picked more
  {
    name: 'hot_chasing',
    weight: 0.05,
    compute: (n, draws) => {
      if (draws.length < 50) return 0;
      const count = draws.reduce(
        (sum, d) => sum + (d.numbers.includes(n) ? 1 : 0), 0
      );
      const expected = draws.length * 6 / 45;
      const zScore = (count - expected) / Math.sqrt(expected);
      // Popular numbers (z > 1) get chased
      return Math.max(0, zScore * 0.008);
    },
  },
  // (11) Consecutive number avoidance by manual players
  // People actively avoid picking consecutive numbers (32,33,34)
  // This means consecutive combos are UNPOPULAR → good for us
  // But we encode this at the per-number level as: numbers near
  // recently selected numbers are slightly more popular
  {
    name: 'adjacency_preference',
    weight: 0.05,
    compute: (n) => {
      // Numbers in the "sweet spot" range (20-35) are picked often
      // in manual selections as "middle ground"
      if (n >= 20 && n <= 35) return 0.01;
      return 0;
    },
  },
  // (12) Anniversary/memorial number patterns
  // YYYY patterns: year digits (20, 25, 19, etc.)
  // Important Korean dates: 15 (광복절), 1 (신정), 25 (크리스마스)
  {
    name: 'memorial_dates',
    weight: 0.05,
    compute: (n) => {
      const memorial: Record<number, number> = {
        1: 0.02,    // 신정/생일 1일
        15: 0.015,  // 광복절, 보름
        25: 0.015,  // 크리스마스
        20: 0.01,   // 2020년대
        12: 0.01,   // 12월
        10: 0.01,   // 10월 (한글날, 개천절)
        3: 0.01,    // 3.1절
        6: 0.01,    // 6.25, 현충일
      };
      return memorial[n] || 0;
    },
  },
];

// ─── Per-Number Unpopularity Score ──────────────────────────────

/**
 * v8.0 — 가중 비인기도 계산
 *
 * 핵심 변경:
 *   - 단기 가중 데이터(WeightedDraw[]) 지원
 *   - recency/hot_chasing bias가 가중치 반영하여 최근 트렌드 더 정확히 모델링
 *   - softmax temperature를 0.02 → 0.015로 조정 (분별력 강화)
 *
 * Higher = fewer people choose this number = better for expected value.
 */
export function computeUnpopularityVector(
  draws: LottoDrawResult[] | WeightedDraw[],
): Map<number, number> {
  // WeightedDraw 판별 및 원본 추출
  const isWeighted = draws.length > 0 && 'weight' in draws[0];
  const rawDraws: LottoDrawResult[] = isWeighted
    ? (draws as WeightedDraw[]).map(w => w.draw)
    : (draws as LottoDrawResult[]);
  const weights: number[] | null = isWeighted
    ? (draws as WeightedDraw[]).map(w => w.weight)
    : null;

  // Step 1: Compute raw popularity for each number
  const rawPopularity: number[] = new Array(46).fill(0);

  for (let n = 1; n <= 45; n++) {
    let totalPopularity = 0;
    let totalBiasWeight = 0;

    for (const bias of BIASES) {
      let raw: number;

      if (weights && (bias.name === 'recency' || bias.name === 'hot_chasing')) {
        // 가중 버전: 시간 감쇠가 이미 weights에 반영됨
        raw = computeWeightedBias(bias, n, rawDraws, weights);
      } else {
        raw = bias.compute(n, rawDraws);
      }

      totalPopularity += raw * bias.weight;
      totalBiasWeight += bias.weight;
    }

    rawPopularity[n] = totalPopularity / totalBiasWeight;
  }

  // Step 2: Softmax normalization — temperature 낮춰서 분별력 강화
  const temperature = 0.015;
  const negScaled = [];
  for (let n = 1; n <= 45; n++) {
    negScaled.push(-rawPopularity[n] / temperature);
  }

  const maxVal = Math.max(...negScaled);
  const exps = negScaled.map(x => Math.exp(x - maxVal));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  const softmaxed = exps.map(e => e / sumExps);

  // Step 3: Rescale to [0.15, 1.0]
  const minSoftmax = Math.min(...softmaxed);
  const maxSoftmax = Math.max(...softmaxed);
  const range = maxSoftmax - minSoftmax || 1;

  const scores = new Map<number, number>();
  for (let n = 1; n <= 45; n++) {
    const normalized = (softmaxed[n - 1] - minSoftmax) / range;
    const unpopularity = 0.15 + normalized * 0.85;
    scores.set(n, unpopularity);
  }

  return scores;
}

/**
 * 가중 bias 계산: recency, hot_chasing 등 draws 순서에 의존하는 bias에
 * 시간 감쇠 가중치를 적용한다.
 */
function computeWeightedBias(
  bias: BiasConfig,
  num: number,
  draws: LottoDrawResult[],
  weights: number[],
): number {
  if (bias.name === 'recency') {
    // 가중 recency: 각 회차의 가중치를 직접 반영
    let score = 0;
    const limit = Math.min(draws.length, 30); // 단기 윈도우 내에서만
    for (let i = 0; i < limit; i++) {
      if (draws[i].numbers.includes(num)) {
        score += 0.012 * weights[i] * draws.length; // 정규화 보정
      }
      if (draws[i].bonus === num) {
        score += 0.006 * weights[i] * draws.length;
      }
    }
    return score;
  }

  if (bias.name === 'hot_chasing') {
    if (draws.length < 50) return 0;
    // 가중 빈도 계산
    let weightedCount = 0;
    let weightSum = 0;
    for (let i = 0; i < draws.length; i++) {
      if (draws[i].numbers.includes(num)) {
        weightedCount += weights[i];
      }
      weightSum += weights[i];
    }
    const expected = weightSum * 6 / 45;
    const ratio = expected > 0 ? weightedCount / expected : 1;
    return Math.max(0, (ratio - 1) * 0.008);
  }

  // fallback
  return bias.compute(num, draws);
}

// ─── Combination-Level Score ────────────────────────────────────

/**
 * Geometric mean of individual unpopularity scores,
 * penalized by common pattern detection.
 */
export function combinationUnpopularity(
  combo: number[],
  unpopVector: Map<number, number>,
): number {
  // Base: geometric mean of unpopularity
  let logSum = 0;
  for (const n of combo) {
    const u = unpopVector.get(n) || 0.5;
    logSum += Math.log(Math.max(u, 0.001));
  }
  const geoMean = Math.exp(logSum / combo.length);

  // Pattern penalty: detect and penalize common manual patterns
  const patternPenalty = detectCommonPatterns(combo);

  return geoMean * (1 - patternPenalty);
}

/**
 * Detect common patterns that manual players use.
 * Returns penalty in [0, 0.5] — higher = more likely human-chosen.
 */
function detectCommonPatterns(combo: number[]): number {
  const sorted = [...combo].sort((a, b) => a - b);
  let penalty = 0;

  // (1) Arithmetic sequence detection
  // Check if numbers form an AP or near-AP
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    diffs.push(sorted[i] - sorted[i - 1]);
  }
  const allSame = diffs.every(d => d === diffs[0]);
  if (allSame) penalty += 0.15; // perfect AP — very popular pattern
  else {
    // Near-AP: variance of differences is small
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const diffVar = diffs.reduce((s, d) => s + (d - meanDiff) ** 2, 0) / diffs.length;
    if (diffVar < 1.0) penalty += 0.08; // almost AP
    else if (diffVar < 2.0) penalty += 0.03;
  }

  // (2) All same decade (e.g., all 30s)
  const decades = sorted.map(n => Math.floor((n - 1) / 10));
  const uniqueDecades = new Set(decades);
  if (uniqueDecades.size === 1) penalty += 0.10; // all from same group
  if (uniqueDecades.size === 2) penalty += 0.03;

  // (3) Multiples of a single number
  for (const base of [2, 3, 4, 5, 6, 7]) {
    const isMultiple = sorted.every(n => n % base === 0);
    if (isMultiple) penalty += 0.12;
  }

  // (4) Palindrome-like pattern (e.g., 5,15,25,35,45)
  // Check if last digits form a pattern
  const lastDigits = sorted.map(n => n % 10);
  const uniqueLastDigits = new Set(lastDigits);
  if (uniqueLastDigits.size === 1) penalty += 0.08; // all same last digit

  // (5) "Lucky number" clustering
  const luckySet = new Set([3, 7, 8, 11, 13, 17, 21, 23, 27, 33, 37]);
  const luckyCount = sorted.filter(n => luckySet.has(n)).length;
  if (luckyCount >= 5) penalty += 0.06;
  if (luckyCount >= 4) penalty += 0.03;

  // (6) All low numbers (≤22) — birthday range
  const lowCount = sorted.filter(n => n <= 22).length;
  if (lowCount === 6) penalty += 0.10;
  if (lowCount === 5) penalty += 0.04;

  return Math.min(penalty, 0.50); // cap at 50%
}

// ─── Estimated Co-Winners ───────────────────────────────────────

/**
 * Estimate expected number of co-winners for a given combination.
 *
 * P(combo) = 0.7 × 1/C(45,6) + 0.3 × P_manual(combo)
 * E[co-winners] = totalTickets × P(combo)
 */
export function estimateCoWinners(
  combo: number[],
  unpopVector: Map<number, number>,
  estimatedWeeklySales: number = 70_000_000_000,
): number {
  const ticketPrice = 1000;
  const totalTickets = estimatedWeeklySales / ticketPrice;
  const totalCombinations = 8_145_060;

  // Auto pick probability (uniform)
  const pAuto = 1 / totalCombinations;

  // Manual pick probability (biased by popularity)
  const comboPopularity = 1 - combinationUnpopularity(combo, unpopVector);
  // Popular combo → up to 8x the uniform probability (increased from 5x)
  const pManual = pAuto * (1 + comboPopularity * 7);

  // 70% auto, 30% manual (Korean lotto auto-pick ratio ~70%)
  const pCombo = 0.7 * pAuto + 0.3 * pManual;

  return totalTickets * pCombo;
}
