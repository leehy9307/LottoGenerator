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

const ALGORITHM_VERSION = '7.0.0';

/**
 * ┌──────────────────────────────────────────────────────────────┐
 * │  v7.0 — Advanced Game Theory + SA-MCMC + Pattern Avoidance  │
 * ├──────────────────────────────────────────────────────────────┤
 * │                                                              │
 * │  Philosophy: "Don't predict. Optimize the game.              │
 * │              Choose what others won't."                      │
 * │                                                              │
 * │  Pipeline:                                                   │
 * │  [1] Population Model    → 45-dim unpopularity (12 biases)  │
 * │  [2] Structural Profile  → Bayesian 10-dim validator + AC   │
 * │  [3] Pattern Avoidance   → explicit common pattern penalty  │
 * │  [4] SA-MCMC Sampler     → simulated annealing optimizer    │
 * │  [5] Multi-Candidate     → generate N, pick best            │
 * │  [6] Expected Value      → financial analysis               │
 * │  [7] Orchestrator        → result + metadata                │
 * │                                                              │
 * └──────────────────────────────────────────────────────────────┘
 */

// ─── Public Interface ───────────────────────────────────────────

export interface ExpertPickResult {
  numbers: number[];
  strategy: StrategyInfo;
}

const NUM_CANDIDATES = 5; // Generate 5 candidates, pick the best

/**
 * Expert Pick v7.0 — Advanced Game Theory + SA-MCMC
 */
export function generateExpertPick(
  draws: LottoDrawResult[],
  timestamp?: number,
  carryoverMisses: number = 0,
): ExpertPickResult {
  // ════════════════════════════════════════════════════════════
  // Stage 1: Population Model — 12 cognitive biases
  // ════════════════════════════════════════════════════════════

  const unpopVector = computeUnpopularityVector(draws);

  // ════════════════════════════════════════════════════════════
  // Stage 2: Structural Profile — 10 Bayesian dimensions + AC
  // ════════════════════════════════════════════════════════════

  const structProfile = buildStructuralProfile(draws);

  // ════════════════════════════════════════════════════════════
  // Stage 3: Combined Scoring Function
  // ════════════════════════════════════════════════════════════

  const scoreFn: MCMCScoringFn = (combo: number[]) => {
    // Hard constraint → immediate reject
    if (!passesHardConstraints(combo)) return -1000;

    // Anti-popularity (geometric mean with pattern penalty, 0~1)
    const antiPop = combinationUnpopularity(combo, unpopVector);

    // Structural fit (weighted Bayesian, 0~1)
    const structural = scoreCombinationStructure(combo, structProfile);
    if (structural.hardReject) return -1000;

    // AC bonus: reward high arithmetic complexity
    const acBonus = Math.min(structural.acValue / 15, 1.0) * 0.1;

    // Combined log-density
    const logAntiPop = Math.log(Math.max(antiPop, 0.001));
    const logStruct = Math.log(Math.max(structural.totalScore, 0.001));

    // v7.0 weights: anti-popularity is king (55%), structure (30%), AC (15%)
    return logAntiPop * 0.55 + logStruct * 0.30 + acBonus * 0.15;
  };

  // ════════════════════════════════════════════════════════════
  // Stage 4: Multi-Candidate SA-MCMC Sampling
  // ════════════════════════════════════════════════════════════

  const baseSeed = timestamp
    ? (timestamp ^ (timestamp >>> 16)) >>> 0
    : undefined;

  let bestNumbers: number[] = [];
  let bestFinalScore = -Infinity;
  let bestMcmcResult = runMCMC(scoreFn, baseSeed);

  // Generate multiple candidates with different seeds
  for (let candidate = 0; candidate < NUM_CANDIDATES; candidate++) {
    const candidateSeed = baseSeed !== undefined
      ? (baseSeed + candidate * 48611) >>> 0
      : undefined;

    const mcmcResult = runMCMC(scoreFn, candidateSeed);
    const finalScore = scoreFn(mcmcResult.bestCombo);

    if (finalScore > bestFinalScore) {
      bestFinalScore = finalScore;
      bestNumbers = mcmcResult.bestCombo;
      bestMcmcResult = mcmcResult;
    }
  }

  // ════════════════════════════════════════════════════════════
  // Stage 5: Expected Value — financial analysis
  // ════════════════════════════════════════════════════════════

  const numbers = bestNumbers;
  const antiPopScore = combinationUnpopularity(numbers, unpopVector);
  const structScore = scoreCombinationStructure(numbers, structProfile);
  const coWinners = estimateCoWinners(numbers, unpopVector);

  const evResult = calculateExpectedValue(
    carryoverMisses,
    coWinners,
    bestMcmcResult.converged,
  );

  const jackpot = estimateJackpot(carryoverMisses, coWinners);

  // ════════════════════════════════════════════════════════════
  // Stage 6: Assemble metadata
  // ════════════════════════════════════════════════════════════

  const strategy: StrategyInfo = {
    algorithmVersion: ALGORITHM_VERSION,
    factorSummary: `SA-MCMC + Pattern Avoidance (${bestMcmcResult.method})`,
    populationAvoidanceScore: round2(antiPopScore),
    structuralFitScore: round2(structScore.totalScore),
    mcmcConvergence: round3(bestMcmcResult.rHat),
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
