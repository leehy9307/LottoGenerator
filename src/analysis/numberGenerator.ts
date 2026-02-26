import { LottoDrawResult, StrategyInfo } from '../types/lotto';
import {
  computeUnpopularityVector,
  combinationUnpopularity,
  estimateCoWinners,
} from './populationModel';
import {
  buildStructuralProfile,
  scoreCombinationStructure,
  passesHardConstraints,
} from './structuralProfile';
import { runMCMC, MCMCScoringFn } from './mcmcSampler';
import {
  calculateExpectedValue,
  estimateJackpot,
  formatKoreanWon,
} from './expectedValue';

const ALGORITHM_VERSION = '6.0.0';

/**
 * ┌──────────────────────────────────────────────────────────────┐
 * │  v6.0 — Game Theory + MCMC Sampler                          │
 * ├──────────────────────────────────────────────────────────────┤
 * │                                                              │
 * │  Philosophy: "Don't predict. Optimize the game."             │
 * │                                                              │
 * │  Pipeline:                                                   │
 * │  [1] Population Model    → 45-dim unpopularity vector        │
 * │  [2] Structural Profile  → Bayesian 8-dim validator          │
 * │  [3] MCMC Sampler        → optimal combination               │
 * │  [4] Expected Value      → financial analysis                │
 * │  [5] Orchestrator        → result + metadata                 │
 * │                                                              │
 * └──────────────────────────────────────────────────────────────┘
 */

// ─── Public Interface ───────────────────────────────────────────

export interface ExpertPickResult {
  numbers: number[];
  strategy: StrategyInfo;
}

/**
 * Expert Pick v6.0 — Game Theory + MCMC Sampler
 *
 * Stage 1: Build unpopularity vector (Population Model)
 * Stage 2: Build structural profile (Bayesian)
 * Stage 3: MCMC sampling with combined scoring
 * Stage 4: Expected value calculation
 * Stage 5: Assemble metadata
 */
export function generateExpertPick(
  draws: LottoDrawResult[],
  timestamp?: number,
  carryoverMisses: number = 0,
): ExpertPickResult {
  // ════════════════════════════════════════════════════════════
  // Stage 1: Population Model — what to avoid
  // ════════════════════════════════════════════════════════════

  const unpopVector = computeUnpopularityVector(draws);

  // ════════════════════════════════════════════════════════════
  // Stage 2: Structural Profile — what structure is natural
  // ════════════════════════════════════════════════════════════

  const structProfile = buildStructuralProfile(draws);

  // ════════════════════════════════════════════════════════════
  // Stage 3: MCMC Sampling — how to generate
  // ════════════════════════════════════════════════════════════

  // Combined scoring function for MCMC
  const scoreFn: MCMCScoringFn = (combo: number[]) => {
    // Hard constraint check → -Infinity for invalid combos
    if (!passesHardConstraints(combo)) return -1000;

    // Anti-popularity (geometric mean, 0~1)
    const antiPop = combinationUnpopularity(combo, unpopVector);

    // Structural fit (weighted Bayesian, 0~1)
    const structural = scoreCombinationStructure(combo, structProfile);
    if (structural.hardReject) return -1000;

    // Combined log-density: log(antiPop) + log(structFit)
    // Both in [0,1], log converts to negative → higher is better
    const logAntiPop = Math.log(Math.max(antiPop, 0.001));
    const logStruct = Math.log(Math.max(structural.totalScore, 0.001));

    return logAntiPop * 0.6 + logStruct * 0.4;
  };

  // Use timestamp as seed for reproducibility within same second
  const seed = timestamp
    ? (timestamp ^ (timestamp >>> 16)) >>> 0
    : undefined;

  const mcmcResult = runMCMC(scoreFn, seed);

  // ════════════════════════════════════════════════════════════
  // Stage 4: Expected Value — why this combo is good
  // ════════════════════════════════════════════════════════════

  const numbers = mcmcResult.bestCombo;
  const antiPopScore = combinationUnpopularity(numbers, unpopVector);
  const structScore = scoreCombinationStructure(numbers, structProfile);
  const coWinners = estimateCoWinners(numbers, unpopVector);

  const evResult = calculateExpectedValue(
    carryoverMisses,
    coWinners,
    mcmcResult.converged,
  );

  const jackpot = estimateJackpot(carryoverMisses, coWinners);

  // ════════════════════════════════════════════════════════════
  // Stage 5: Assemble metadata
  // ════════════════════════════════════════════════════════════

  const strategy: StrategyInfo = {
    algorithmVersion: ALGORITHM_VERSION,
    factorSummary: `Game Theory + MCMC Sampler (${mcmcResult.method})`,
    populationAvoidanceScore: round2(antiPopScore),
    structuralFitScore: round2(structScore.totalScore),
    mcmcConvergence: round3(mcmcResult.rHat),
    expectedValue: evResult.totalEV,
    expectedValueBreakdown: {
      ev3: evResult.evByRank.ev3,
      ev4: evResult.evByRank.ev4,
      ev5: evResult.evByRank.ev5,
    },
    estimatedCoWinners: round2(jackpot.estimatedCoWinners),
    recommendation: evResult.recommendation,
    reasoning: evResult.reasoning,
    confidenceScore: round2(evResult.confidenceScore),
    carryoverMisses,
    estimatedJackpot: formatKoreanWon(jackpot.estimatedJackpot),
  };

  return { numbers, strategy };
}

// ─── Utilities ──────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  if (isNaN(n)) return NaN;
  return Math.round(n * 1000) / 1000;
}
