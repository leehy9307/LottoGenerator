/**
 * MCMC Sampler v10.0 — Optimized SA-MH for Mobile
 *
 * v10.0 최적화 (v7.0 대비 ~93% 연산량 감소):
 *  - 체인: 8 → 4 (수렴에 4개면 충분)
 *  - 리스타트: 5 → 2 (글로벌 옵티멈 탐색 효율화)
 *  - 번인: 12000 → 2000 (어닐링 스케줄 급랭으로 보상)
 *  - 샘플: 2000 → 500
 *  - 급랭 스케줄: T_START 3.0→2.0, T_END 0.05→0.02
 *  - 샘플 저장 제거: best만 추적 (메모리 절약)
 *
 * 기존: 8×14000×5 = 560,000 scoreFn 호출/게임
 * 최적화: 4×2500×2 = 20,000 scoreFn 호출/게임 (28배 감소)
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
  (combo: number[]): number;
}

export interface MCMCResult {
  bestCombo: number[];
  bestScore: number;
  rHat: number;
  converged: boolean;
  method: 'mcmc' | 'rejection';
  totalIterations: number;
  acceptanceRate: number;
}

// ─── Configuration (v10.0 Mobile Optimized) ─────────────────────

const NUM_CHAINS = 4;       // v7: 8 → 4
const BURN_IN = 2000;       // v7: 12000 → 2000
const SAMPLE_COUNT = 500;   // v7: 2000 → 500
const TOTAL_ITER = BURN_IN + SAMPLE_COUNT;

const T_START = 2.0;        // v7: 3.0 → 2.0 (더 빠른 수렴)
const T_END = 0.02;         // v7: 0.05 → 0.02 (더 날카로운 수렴)
const NUM_RESTARTS = 2;     // v7: 5 → 2

/**
 * Run optimized multi-chain SA-MH sampler.
 */
export function runMCMC(
  scoreFn: MCMCScoringFn,
  seed?: number,
): MCMCResult {
  const baseSeed = seed ?? createTimeSeed();

  let globalBestCombo: number[] = [];
  let globalBestScore = -Infinity;
  let bestChainBests: number[] = []; // R-hat 계산용: 각 체인의 best score
  let totalAccepted = 0;
  let totalProposed = 0;

  for (let restart = 0; restart < NUM_RESTARTS; restart++) {
    const restartSeed = baseSeed + restart * 104729;
    const chainBests: number[] = [];

    for (let c = 0; c < NUM_CHAINS; c++) {
      const rng = mulberry32(restartSeed + c * 7919);
      const result = runSingleChain(scoreFn, rng);

      chainBests.push(result.bestScore);
      totalAccepted += result.accepted;
      totalProposed += result.proposed;

      if (result.bestScore > globalBestScore) {
        globalBestScore = result.bestScore;
        globalBestCombo = result.bestCombo;
      }
    }

    if (restart === 0) {
      bestChainBests = chainBests;
    }
  }

  // 간소화된 수렴 판단: 체인 간 best score 분산으로 판단
  const rHat = computeSimpleConvergence(bestChainBests);
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

  return rejectionSample(scoreFn, baseSeed);
}

// ─── Single Chain (최적화: best만 추적) ──────────────────────────

interface ChainResult {
  bestCombo: number[];
  bestScore: number;
  accepted: number;
  proposed: number;
}

function runSingleChain(
  scoreFn: MCMCScoringFn,
  rng: () => number,
): ChainResult {
  let current = randomCombo(rng);
  let currentScore = scoreFn(current);
  let bestCombo = current;
  let bestScore = currentScore;
  let accepted = 0;
  let proposed = 0;

  for (let iter = 0; iter < TOTAL_ITER; iter++) {
    const progress = iter / TOTAL_ITER;
    const temperature = T_START * Math.pow(T_END / T_START, progress);

    const useDoubleSwap = rng() < (progress < 0.5 ? 0.35 : 0.10);
    const proposed_combo = useDoubleSwap
      ? proposeDoubleSwap(current, rng)
      : proposeSwap(current, rng);
    const proposedScore = scoreFn(proposed_combo);
    proposed++;

    const logAlpha = (proposedScore - currentScore) / temperature;
    if (logAlpha >= 0 || Math.log(rng()) < logAlpha) {
      current = proposed_combo;
      currentScore = proposedScore;
      accepted++;

      // best만 추적 (샘플 배열 저장 제거 → 메모리 절약)
      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestCombo = [...current];
      }
    }
  }

  return { bestCombo, bestScore, accepted, proposed };
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
  } while (existing.has(newNum) && attempts < 50);

  result[replaceIdx] = newNum;
  return result;
}

function proposeDoubleSwap(combo: number[], rng: () => number): number[] {
  const result = [...combo];
  const existing = new Set(combo);

  const idx1 = Math.floor(rng() * 6);
  let idx2 = Math.floor(rng() * 5);
  if (idx2 >= idx1) idx2++;

  let newNum1: number;
  let attempts = 0;
  do {
    newNum1 = Math.floor(rng() * 45) + 1;
    attempts++;
  } while (existing.has(newNum1) && attempts < 50);
  result[idx1] = newNum1;

  const existing2 = new Set(result);
  let newNum2: number;
  attempts = 0;
  do {
    newNum2 = Math.floor(rng() * 45) + 1;
    attempts++;
  } while (existing2.has(newNum2) && attempts < 50);
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

// ─── Convergence Check (간소화) ────────────────────────────────

function computeSimpleConvergence(chainBests: number[]): number {
  if (chainBests.length < 2) return 2.0;

  const mean = chainBests.reduce((a, b) => a + b, 0) / chainBests.length;
  const variance = chainBests.reduce((s, x) => s + (x - mean) ** 2, 0) / chainBests.length;

  if (mean === 0) return 1.0;

  // CV (변동계수) 기반: 체인 간 best score가 비슷하면 수렴
  const cv = Math.sqrt(variance) / Math.abs(mean);
  // CV < 0.1 → 수렴 (R-hat ≈ 1.0)
  return 1.0 + cv * 2;
}

// ─── Fallback: Rejection Sampling (축소) ─────────────────────────

function rejectionSample(
  scoreFn: MCMCScoringFn,
  baseSeed: number,
): MCMCResult {
  const rng = mulberry32(baseSeed + 99991);
  let bestCombo = randomCombo(rng);
  let bestScore = scoreFn(bestCombo);

  for (let i = 0; i < 1500; i++) {
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
    totalIterations: 1500,
    acceptanceRate: 0,
  };
}
