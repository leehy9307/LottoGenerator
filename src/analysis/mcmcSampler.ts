/**
 * MCMC Sampler v7.0 — Simulated Annealing + Metropolis-Hastings
 *
 * Key improvements over v6.0:
 *  - Simulated annealing schedule for better global exploration
 *  - Multi-swap proposals (1 or 2 swaps per step)
 *  - 6 chains (up from 4) for better convergence
 *  - Longer burn-in with cooling schedule
 *  - Multiple restarts with best-of selection
 *  - Improved rejection sampling fallback
 *
 * Target distribution:
 *   π(combo) ∝ exp(score(combo) / T)
 *   where T decreases over iterations (annealing)
 */

// ─── PRNG ───────────────────────────────────────────────────────

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

// ─── Types ──────────────────────────────────────────────────────

export interface MCMCScoringFn {
  (combo: number[]): number; // log-density (higher = better)
}

export interface MCMCResult {
  bestCombo: number[];
  bestScore: number;
  rHat: number;           // Gelman-Rubin diagnostic
  converged: boolean;
  method: 'mcmc' | 'rejection';
  totalIterations: number;
  acceptanceRate: number;
}

// ─── Configuration ──────────────────────────────────────────────

const NUM_CHAINS = 8;
const BURN_IN = 12000;
const SAMPLE_COUNT = 2000;
const TOTAL_ITER = BURN_IN + SAMPLE_COUNT;

// Simulated annealing temperature schedule
const T_START = 3.0;    // higher start = broader exploration of solution space
const T_END = 0.05;     // lower end = sharper convergence to optimal
const NUM_RESTARTS = 5;  // more restarts = better global optimum

/**
 * Run multi-chain MH sampler with simulated annealing.
 */
export function runMCMC(
  scoreFn: MCMCScoringFn,
  seed?: number,
): MCMCResult {
  const baseSeed = seed ?? createTimeSeed();

  let globalBestCombo: number[] = [];
  let globalBestScore = -Infinity;
  let bestChains: number[][][] = [];
  let bestChainScores: number[][] = [];
  let totalAccepted = 0;
  let totalProposed = 0;

  // Multiple restarts for robustness
  for (let restart = 0; restart < NUM_RESTARTS; restart++) {
    const restartSeed = baseSeed + restart * 104729;
    const chains: number[][][] = [];
    const chainScores: number[][] = [];

    for (let c = 0; c < NUM_CHAINS; c++) {
      const rng = mulberry32(restartSeed + c * 7919);
      const { samples, scores, accepted, proposed } = runSingleChain(scoreFn, rng);
      chains.push(samples);
      chainScores.push(scores);
      totalAccepted += accepted;
      totalProposed += proposed;

      // Track global best
      for (let i = 0; i < scores.length; i++) {
        if (scores[i] > globalBestScore) {
          globalBestScore = scores[i];
          globalBestCombo = samples[i];
        }
      }
    }

    if (restart === 0) {
      bestChains = chains;
      bestChainScores = chainScores;
    }
  }

  // Gelman-Rubin R-hat on the score dimension (use first restart's chains)
  const rHat = computeRHat(bestChainScores);
  const converged = rHat < 1.1;
  const acceptanceRate = totalProposed > 0 ? totalAccepted / totalProposed : 0;

  if (converged || globalBestScore > -100) {
    return {
      bestCombo: [...globalBestCombo].sort((a, b) => a - b),
      bestScore: globalBestScore,
      rHat,
      converged,
      method: 'mcmc',
      totalIterations: TOTAL_ITER * NUM_CHAINS * NUM_RESTARTS,
      acceptanceRate,
    };
  }

  // Fallback: enhanced rejection sampling
  return rejectionSample(scoreFn, baseSeed);
}

// ─── Single Chain with Simulated Annealing ──────────────────────

function runSingleChain(
  scoreFn: MCMCScoringFn,
  rng: () => number,
): { samples: number[][]; scores: number[]; accepted: number; proposed: number } {
  let current = randomCombo(rng);
  let currentScore = scoreFn(current);

  const samples: number[][] = [];
  const scores: number[] = [];
  let accepted = 0;
  let proposed = 0;

  for (let iter = 0; iter < TOTAL_ITER; iter++) {
    // Annealing temperature: exponential cooling
    const progress = iter / TOTAL_ITER;
    const temperature = T_START * Math.pow(T_END / T_START, progress);

    // Adaptive proposal: early = bold exploration, late = fine tuning
    const useDoubleSwap = rng() < (progress < 0.5 ? 0.4 : 0.15);
    const proposed_combo = useDoubleSwap
      ? proposeDoubleSwap(current, rng)
      : proposeSwap(current, rng);
    const proposedScore = scoreFn(proposed_combo);
    proposed++;

    // Annealed MH acceptance
    const logAlpha = (proposedScore - currentScore) / temperature;
    if (logAlpha >= 0 || Math.log(rng()) < logAlpha) {
      current = proposed_combo;
      currentScore = proposedScore;
      accepted++;
    }

    // Collect after burn-in
    if (iter >= BURN_IN) {
      samples.push([...current]);
      scores.push(currentScore);
    }
  }

  return { samples, scores, accepted, proposed };
}

// ─── Proposals ──────────────────────────────────────────────────

function proposeSwap(combo: number[], rng: () => number): number[] {
  const result = [...combo];
  const replaceIdx = Math.floor(rng() * 6);
  const existing = new Set(combo);

  let newNum: number;
  let attempts = 0;
  do {
    newNum = Math.floor(rng() * 45) + 1;
    attempts++;
  } while (existing.has(newNum) && attempts < 100);

  result[replaceIdx] = newNum;
  return result;
}

function proposeDoubleSwap(combo: number[], rng: () => number): number[] {
  const result = [...combo];
  const existing = new Set(combo);

  // Pick two distinct positions to swap
  const idx1 = Math.floor(rng() * 6);
  let idx2 = Math.floor(rng() * 5);
  if (idx2 >= idx1) idx2++;

  // Replace first
  let newNum1: number;
  let attempts = 0;
  do {
    newNum1 = Math.floor(rng() * 45) + 1;
    attempts++;
  } while (existing.has(newNum1) && attempts < 100);
  result[idx1] = newNum1;

  // Replace second
  const existing2 = new Set(result);
  let newNum2: number;
  attempts = 0;
  do {
    newNum2 = Math.floor(rng() * 45) + 1;
    attempts++;
  } while (existing2.has(newNum2) && attempts < 100);
  result[idx2] = newNum2;

  return result;
}

// ─── Random Initial Combo ───────────────────────────────────────

function randomCombo(rng: () => number): number[] {
  const nums: number[] = [];
  const used = new Set<number>();
  while (nums.length < 6) {
    const n = Math.floor(rng() * 45) + 1;
    if (!used.has(n)) {
      nums.push(n);
      used.add(n);
    }
  }
  return nums.sort((a, b) => a - b);
}

// ─── Gelman-Rubin R-hat ────────────────────────────────────────

function computeRHat(chainScores: number[][]): number {
  const m = chainScores.length;
  const n = chainScores[0]?.length || 0;
  if (n < 2 || m < 2) return 2.0;

  const chainMeans = chainScores.map(
    chain => chain.reduce((a, b) => a + b, 0) / n
  );

  const grandMean = chainMeans.reduce((a, b) => a + b, 0) / m;

  const B = (n / (m - 1)) * chainMeans.reduce(
    (sum, cm) => sum + (cm - grandMean) ** 2, 0
  );

  const W = chainScores.reduce((sum, chain, i) => {
    const cm = chainMeans[i];
    const s2 = chain.reduce((s, x) => s + (x - cm) ** 2, 0) / (n - 1);
    return sum + s2;
  }, 0) / m;

  if (W === 0) return 1.0;

  const varHat = ((n - 1) / n) * W + (1 / n) * B;

  return Math.sqrt(varHat / W);
}

// ─── Fallback: Enhanced Rejection Sampling ──────────────────────

function rejectionSample(
  scoreFn: MCMCScoringFn,
  baseSeed: number,
): MCMCResult {
  const rng = mulberry32(baseSeed + 99991);
  let bestCombo = randomCombo(rng);
  let bestScore = scoreFn(bestCombo);

  // More samples than v6 (3000 vs 1000)
  for (let i = 0; i < 3000; i++) {
    const combo = randomCombo(rng);
    const score = scoreFn(combo);
    if (score > bestScore) {
      bestScore = score;
      bestCombo = combo;
    }
  }

  return {
    bestCombo: [...bestCombo].sort((a, b) => a - b),
    bestScore,
    rHat: NaN,
    converged: false,
    method: 'rejection',
    totalIterations: 3000,
    acceptanceRate: 0,
  };
}
