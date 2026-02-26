import { LottoDrawResult } from '../types/lotto';

/**
 * Population Model — Adversarial Human Bias Engine
 *
 * Models how Korean lotto players choose numbers,
 * producing a 45-dimensional unpopularity vector.
 *
 * 8 cognitive bias sources with empirically calibrated weights.
 * Combination-level score uses geometric mean to penalize "weakest link".
 */

// ─── 8 Bias Sources ──────────────────────────────────────────────

interface BiasConfig {
  weight: number;
  compute: (num: number, draws: LottoDrawResult[]) => number;
}

const BIASES: BiasConfig[] = [
  // (1) Birthday bias: 1-12 strong, 13-31 moderate
  {
    weight: 0.25,
    compute: (n) => {
      if (n <= 12) return 0.08;
      if (n <= 31) return 0.05;
      return 0;
    },
  },
  // (2) Lucky numbers: 7, 3, 8, and their decades
  {
    weight: 0.15,
    compute: (n) => {
      const lucky: Record<number, number> = {
        7: 0.06, 3: 0.04, 8: 0.03,
        17: 0.03, 27: 0.02, 37: 0.02,
        13: 0.02, 23: 0.01, 33: 0.01, 43: 0.01,
        18: 0.01, 28: 0.01, 38: 0.01,
      };
      return lucky[n] || 0;
    },
  },
  // (3) Korean cultural bias: avoid 4, prefer 8
  {
    weight: 0.10,
    compute: (n) => {
      if (n === 4 || n === 14 || n === 24 || n === 34 || n === 44) return -0.03;
      if (n === 8 || n === 18 || n === 28 || n === 38) return 0.02;
      return 0;
    },
  },
  // (4) Slip visual pattern: top-row + center-column preference
  {
    weight: 0.10,
    compute: (n) => {
      // Lotto slip: 7 columns × 7 rows (1-7 top row)
      const row = Math.ceil(n / 7);
      const col = ((n - 1) % 7) + 1;
      let bias = Math.max(0, (7 - row) * 0.005); // top row preference
      if (col >= 3 && col <= 5) bias += 0.01;     // center column preference
      return bias;
    },
  },
  // (5) Round numbers
  {
    weight: 0.08,
    compute: (n) => {
      if (n % 10 === 0) return 0.02;
      if (n % 5 === 0) return 0.01;
      return 0;
    },
  },
  // (6) Recent winning number mimicry (10 draws, exponential decay)
  {
    weight: 0.12,
    compute: (n, draws) => {
      const sorted = [...draws].sort((a, b) => b.drawNo - a.drawNo);
      const recent = sorted.slice(0, 10);
      let score = 0;
      for (let i = 0; i < recent.length; i++) {
        if (recent[i].numbers.includes(n)) {
          score += 0.015 * Math.exp(-0.2 * i); // exponential decay
        }
      }
      return score;
    },
  },
  // (7) Arithmetic/symmetric patterns (multiples of 5, 7)
  {
    weight: 0.10,
    compute: (n) => {
      let bias = 0;
      if (n % 5 === 0) bias += 0.015;  // 5-multiples popular in sequences
      if (n % 7 === 0) bias += 0.01;   // 7-multiples popular in sequences
      return bias;
    },
  },
  // (8) Low-number familiarity: 1-10 most familiar, 11-22 moderate
  {
    weight: 0.10,
    compute: (n) => {
      if (n <= 10) return 0.03;
      if (n <= 22) return 0.015;
      return 0;
    },
  },
];

// ─── Per-Number Unpopularity Score ──────────────────────────────

/**
 * Compute per-number unpopularity score (0~1).
 * Higher = fewer people choose this number = better for expected value.
 */
export function computeUnpopularityVector(
  draws: LottoDrawResult[],
): Map<number, number> {
  const scores = new Map<number, number>();

  for (let n = 1; n <= 45; n++) {
    let popularity = 0;
    let totalWeight = 0;

    for (const bias of BIASES) {
      const raw = bias.compute(n, draws);
      popularity += raw * bias.weight;
      totalWeight += bias.weight;
    }

    // Normalize by total weight
    popularity /= totalWeight;

    // Clamp and convert to unpopularity (higher = less popular = better)
    const unpopularity = 1 - Math.min(Math.max(popularity, -0.05), 0.15) / 0.15;
    scores.set(n, unpopularity);
  }

  return scores;
}

// ─── Combination-Level Score ────────────────────────────────────

/**
 * Geometric mean of individual unpopularity scores.
 * Penalizes combos with even one highly popular number ("weakest link").
 */
export function combinationUnpopularity(
  combo: number[],
  unpopVector: Map<number, number>,
): number {
  let logSum = 0;
  for (const n of combo) {
    const u = unpopVector.get(n) || 0.5;
    logSum += Math.log(Math.max(u, 0.001)); // avoid log(0)
  }
  return Math.exp(logSum / combo.length);
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
  // More popular combos have higher P_manual
  const comboPopularity = 1 - combinationUnpopularity(combo, unpopVector);
  // Scale: average combo → 1/C(45,6), popular combo → up to 5x
  const pManual = pAuto * (1 + comboPopularity * 4);

  // 70% auto, 30% manual
  const pCombo = 0.7 * pAuto + 0.3 * pManual;

  return totalTickets * pCombo;
}
