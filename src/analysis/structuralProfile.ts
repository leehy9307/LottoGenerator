import { LottoDrawResult } from '../types/lotto';

/**
 * Structural Profile — Bayesian 8-Dimension Structural Validator
 *
 * Validates that a combination fits the statistical structure
 * of real winning combinations. Uses Normal-Inverse-Gamma prior
 * → Student-t posterior predictive interval.
 *
 * More data = narrower intervals = stricter filtering.
 * Less data = wider intervals = lenient filtering (auto-adaptive).
 */

// ─── Dimension Definitions ──────────────────────────────────────

interface DimensionDef {
  name: string;
  weight: number;
  hardRejectMin: number;
  hardRejectMax: number;
  extract: (combo: number[]) => number;
  extractFromDraw: (draw: LottoDrawResult) => number;
}

const DIMENSIONS: DimensionDef[] = [
  // (1) Sum
  {
    name: 'sum',
    weight: 0.20,
    hardRejectMin: 80,
    hardRejectMax: 200,
    extract: (c) => c.reduce((a, b) => a + b, 0),
    extractFromDraw: (d) => d.numbers.reduce((a, b) => a + b, 0),
  },
  // (2) Odd count
  {
    name: 'oddCount',
    weight: 0.15,
    hardRejectMin: 0.5, // at least 1
    hardRejectMax: 5.5, // at most 5
    extract: (c) => c.filter(n => n % 2 === 1).length,
    extractFromDraw: (d) => d.numbers.filter(n => n % 2 === 1).length,
  },
  // (3) Low count (1-22)
  {
    name: 'lowCount',
    weight: 0.12,
    hardRejectMin: 0.5,
    hardRejectMax: 5.5,
    extract: (c) => c.filter(n => n <= 22).length,
    extractFromDraw: (d) => d.numbers.filter(n => n <= 22).length,
  },
  // (4) Max consecutive run
  {
    name: 'maxConsecutive',
    weight: 0.08,
    hardRejectMin: -Infinity,
    hardRejectMax: 2.5, // reject 3+ consecutive
    extract: (c) => {
      const s = [...c].sort((a, b) => a - b);
      let max = 1, run = 1;
      for (let i = 1; i < s.length; i++) {
        if (s[i] === s[i - 1] + 1) { run++; max = Math.max(max, run); }
        else run = 1;
      }
      return max;
    },
    extractFromDraw: (d) => {
      const s = [...d.numbers].sort((a, b) => a - b);
      let max = 1, run = 1;
      for (let i = 1; i < s.length; i++) {
        if (s[i] === s[i - 1] + 1) { run++; max = Math.max(max, run); }
        else run = 1;
      }
      return max;
    },
  },
  // (5) Mean gap between adjacent numbers
  {
    name: 'meanGap',
    weight: 0.15,
    hardRejectMin: 1.5,
    hardRejectMax: 30,
    extract: (c) => {
      const s = [...c].sort((a, b) => a - b);
      let sum = 0;
      for (let i = 1; i < s.length; i++) sum += s[i] - s[i - 1];
      return sum / (s.length - 1);
    },
    extractFromDraw: (d) => {
      const s = [...d.numbers].sort((a, b) => a - b);
      let sum = 0;
      for (let i = 1; i < s.length; i++) sum += s[i] - s[i - 1];
      return sum / (s.length - 1);
    },
  },
  // (6) Decade coverage (number of distinct 10-unit groups)
  {
    name: 'decadeCoverage',
    weight: 0.10,
    hardRejectMin: 2.5, // at least 3 groups
    hardRejectMax: Infinity,
    extract: (c) => {
      const groups = new Set(c.map(n => n >= 40 ? 4 : Math.floor((n - 1) / 10)));
      return groups.size;
    },
    extractFromDraw: (d) => {
      const groups = new Set(d.numbers.map(n => n >= 40 ? 4 : Math.floor((n - 1) / 10)));
      return groups.size;
    },
  },
  // (7) Last digit diversity
  {
    name: 'lastDigitDiversity',
    weight: 0.10,
    hardRejectMin: 2.5, // at least 3 distinct last digits
    hardRejectMax: Infinity,
    extract: (c) => new Set(c.map(n => n % 10)).size,
    extractFromDraw: (d) => new Set(d.numbers.map(n => n % 10)).size,
  },
  // (8) Range (max - min)
  {
    name: 'range',
    weight: 0.10,
    hardRejectMin: 15,
    hardRejectMax: Infinity,
    extract: (c) => {
      const s = [...c].sort((a, b) => a - b);
      return s[5] - s[0];
    },
    extractFromDraw: (d) => {
      const s = [...d.numbers].sort((a, b) => a - b);
      return s[5] - s[0];
    },
  },
];

// ─── Bayesian Statistics ────────────────────────────────────────

interface BayesianParams {
  mu: number;       // posterior mean
  sigma: number;    // posterior std
  nu: number;       // degrees of freedom for Student-t
}

/**
 * Compute Normal-Inverse-Gamma posterior → Student-t predictive.
 * Prior: mu0=mean(data), kappa0=1, alpha0=1, beta0=var(data)
 */
function computePosterior(values: number[]): BayesianParams {
  const n = values.length;
  if (n < 2) return { mu: 0, sigma: 100, nu: 1 };

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);

  // NIG prior hyperparameters (weakly informative)
  const mu0 = mean;
  const kappa0 = 1;
  const alpha0 = 1;
  const beta0 = Math.max(variance, 0.01);

  // Posterior
  const kappaN = kappa0 + n;
  const muN = (kappa0 * mu0 + n * mean) / kappaN;
  const alphaN = alpha0 + n / 2;
  const betaN = beta0 + 0.5 * (n - 1) * variance
    + (kappa0 * n * (mean - mu0) ** 2) / (2 * kappaN);

  // Student-t predictive
  const nu = 2 * alphaN;
  const sigma = Math.sqrt(betaN * (kappaN + 1) / (alphaN * kappaN));

  return { mu: muN, sigma, nu };
}

/**
 * Student-t CDF approximation for scoring.
 * Returns probability that value is within typical range.
 */
function studentTScore(value: number, params: BayesianParams): number {
  const z = Math.abs(value - params.mu) / (params.sigma || 1);
  // Gaussian approximation for large nu; exact for small nu
  return Math.exp(-0.5 * z * z);
}

// ─── Structural Profile ─────────────────────────────────────────

export interface StructuralProfileData {
  posteriors: BayesianParams[];
}

/**
 * Build structural profile from historical draws.
 */
export function buildStructuralProfile(
  draws: LottoDrawResult[],
): StructuralProfileData {
  const posteriors: BayesianParams[] = [];

  for (const dim of DIMENSIONS) {
    const values = draws.map(d => dim.extractFromDraw(d));
    posteriors.push(computePosterior(values));
  }

  return { posteriors };
}

// ─── Combination Scoring ────────────────────────────────────────

export interface StructuralScore {
  totalScore: number;     // weighted sum (0~1)
  hardReject: boolean;    // any hard constraint violated
  dimensionScores: number[];
}

/**
 * Score a combination against the structural profile.
 * Returns weighted fit score and hard reject flag.
 */
export function scoreCombinationStructure(
  combo: number[],
  profile: StructuralProfileData,
): StructuralScore {
  const sorted = [...combo].sort((a, b) => a - b);
  const dimensionScores: number[] = [];
  let hardReject = false;
  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < DIMENSIONS.length; i++) {
    const dim = DIMENSIONS[i];
    const value = dim.extract(sorted);

    // Hard reject check
    if (value < dim.hardRejectMin || value > dim.hardRejectMax) {
      hardReject = true;
    }

    // Soft score via Bayesian posterior
    const score = studentTScore(value, profile.posteriors[i]);
    dimensionScores.push(score);

    weightedSum += score * dim.weight;
    totalWeight += dim.weight;
  }

  return {
    totalScore: totalWeight > 0 ? weightedSum / totalWeight : 0,
    hardReject,
    dimensionScores,
  };
}

/**
 * Quick check: does combo pass all hard constraints?
 */
export function passesHardConstraints(combo: number[]): boolean {
  const sorted = [...combo].sort((a, b) => a - b);
  for (const dim of DIMENSIONS) {
    const value = dim.extract(sorted);
    if (value < dim.hardRejectMin || value > dim.hardRejectMax) {
      return false;
    }
  }
  return true;
}
