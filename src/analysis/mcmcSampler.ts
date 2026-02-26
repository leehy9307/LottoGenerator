/**
 * MCMC Sampler — Metropolis-Hastings Constrained Sampler
 *
 * Target distribution:
 *   π(combo) ∝ antiPopularity(combo) × I(structurallyValid(combo))
 *
 * Proposal: replace 1 of 6 numbers uniformly (symmetric → simple MH ratio)
 * 4 chains for Gelman-Rubin convergence diagnostic
 * Burn-in: 5000 | Thinning: 500
 * Convergence: R-hat < 1.1
 *
 * Fallback: Rejection sampling if MCMC doesn't converge
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
}

// ─── Metropolis-Hastings Sampler ────────────────────────────────

const NUM_CHAINS = 4;
const BURN_IN = 5000;
const THINNING = 500;
const TOTAL_ITER = BURN_IN + THINNING;

/**
 * Run 4-chain MH sampler and return the best combination.
 */
export function runMCMC(
  scoreFn: MCMCScoringFn,
  seed?: number,
): MCMCResult {
  const baseSeed = seed ?? createTimeSeed();
  const chains: number[][][] = [];
  const chainScores: number[][] = [];

  for (let c = 0; c < NUM_CHAINS; c++) {
    const rng = mulberry32(baseSeed + c * 7919);
    const { samples, scores } = runSingleChain(scoreFn, rng);
    chains.push(samples);
    chainScores.push(scores);
  }

  // Gelman-Rubin R-hat on the score dimension
  const rHat = computeRHat(chainScores);
  const converged = rHat < 1.1;

  // Find best combo across all chains
  let bestCombo = chains[0][0];
  let bestScore = -Infinity;

  for (let c = 0; c < NUM_CHAINS; c++) {
    for (let i = 0; i < chains[c].length; i++) {
      if (chainScores[c][i] > bestScore) {
        bestScore = chainScores[c][i];
        bestCombo = chains[c][i];
      }
    }
  }

  if (converged) {
    return {
      bestCombo: [...bestCombo].sort((a, b) => a - b),
      bestScore,
      rHat,
      converged: true,
      method: 'mcmc',
    };
  }

  // Fallback: rejection sampling
  return rejectionSample(scoreFn, baseSeed);
}

// ─── Single Chain ───────────────────────────────────────────────

function runSingleChain(
  scoreFn: MCMCScoringFn,
  rng: () => number,
): { samples: number[][]; scores: number[] } {
  // Initialize: random valid combo
  let current = randomCombo(rng);
  let currentScore = scoreFn(current);

  const samples: number[][] = [];
  const scores: number[] = [];

  for (let iter = 0; iter < TOTAL_ITER; iter++) {
    // Propose: swap one number
    const proposed = proposeSwap(current, rng);
    const proposedScore = scoreFn(proposed);

    // MH acceptance (symmetric proposal → ratio = π(proposed)/π(current))
    const logAlpha = proposedScore - currentScore;
    if (logAlpha >= 0 || Math.log(rng()) < logAlpha) {
      current = proposed;
      currentScore = proposedScore;
    }

    // Collect after burn-in
    if (iter >= BURN_IN) {
      samples.push([...current]);
      scores.push(currentScore);
    }
  }

  return { samples, scores };
}

// ─── Proposal: Replace 1 of 6 ──────────────────────────────────

function proposeSwap(combo: number[], rng: () => number): number[] {
  const result = [...combo];
  const replaceIdx = Math.floor(rng() * 6);
  const existing = new Set(combo);

  // Pick a new number not in the combo
  let newNum: number;
  let attempts = 0;
  do {
    newNum = Math.floor(rng() * 45) + 1;
    attempts++;
  } while (existing.has(newNum) && attempts < 100);

  result[replaceIdx] = newNum;
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
  const m = chainScores.length; // number of chains
  const n = chainScores[0].length; // samples per chain
  if (n < 2 || m < 2) return 2.0; // insufficient data

  // Chain means
  const chainMeans = chainScores.map(
    chain => chain.reduce((a, b) => a + b, 0) / n
  );

  // Grand mean
  const grandMean = chainMeans.reduce((a, b) => a + b, 0) / m;

  // Between-chain variance
  const B = (n / (m - 1)) * chainMeans.reduce(
    (sum, cm) => sum + (cm - grandMean) ** 2, 0
  );

  // Within-chain variance
  const W = chainScores.reduce((sum, chain, i) => {
    const cm = chainMeans[i];
    const s2 = chain.reduce((s, x) => s + (x - cm) ** 2, 0) / (n - 1);
    return sum + s2;
  }, 0) / m;

  if (W === 0) return 1.0; // all chains identical

  // Pooled variance estimate
  const varHat = ((n - 1) / n) * W + (1 / n) * B;

  return Math.sqrt(varHat / W);
}

// ─── Fallback: Rejection Sampling ───────────────────────────────

function rejectionSample(
  scoreFn: MCMCScoringFn,
  baseSeed: number,
): MCMCResult {
  const rng = mulberry32(baseSeed + 99991);
  let bestCombo = randomCombo(rng);
  let bestScore = scoreFn(bestCombo);

  for (let i = 0; i < 1000; i++) {
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
  };
}
