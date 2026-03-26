import { LottoDrawResult, StrategyInfo, HybridPipelineResult } from '../types/lotto';
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
import { buildMultiScaleData } from './dataWindowing';
import {
  runPatternEngine,
  scoreCombinationPattern,
  PatternEngineResult,
} from './patternEngine';

import { APP_VERSION } from '../constants/appVersion';

const ALGORITHM_VERSION = APP_VERSION;

/**
 * ┌──────────────────────────────────────────────────────────────┐
 * │  v11.0 — Triple Engine: EV + Pattern + Hybrid Intelligence  │
 * ├──────────────────────────────────────────────────────────────┤
 * │                                                              │
 * │  v10.0 검증 + v11.0 확장:                                    │
 * │  - 비인기 조합 생성 → 공동당첨자 최소화 = 핵심 전략 유지    │
 * │  - NIST 난수성 검증 + PRNG 역추산 파이프라인 추가           │
 * │  - ML(LSTM/Transformer) 앙상블 예측 통합                    │
 * │                                                              │
 * │  트리플 엔진 병렬 생성:                                      │
 * │  ┌─────────────────────────────────────────────┐             │
 * │  │ Game A, B, C — EV-Optimized Engine          │             │
 * │  │  구조 적합도 + AC + 비인기도 극대화          │             │
 * │  │  가중치: 구조 0.45 / AC 0.15 / 비인기 0.40  │             │
 * │  └─────────────────────────────────────────────┘             │
 * │  ┌─────────────────────────────────────────────┐             │
 * │  │ Game D, E — Hybrid Intelligence Engine      │             │
 * │  │  패턴 + NIST/PRNG 분석 + ML 예측 융합       │             │
 * │  │  적응적 가중치 (난수성 판정 기반)            │             │
 * │  └─────────────────────────────────────────────┘             │
 * │                                                              │
 * └──────────────────────────────────────────────────────────────┘
 */

// ─── Public Interface ───────────────────────────────────────────

export interface ExpertPickResult {
  numbers: number[];
  strategy: StrategyInfo;
}

const NUM_GAMES = 5;
const EV_GAMES = 3;  // Game 0,1,2 = EV-Optimized
const DIVERSITY_PENALTY_WEIGHT = 0.20;

// ─── v10.0 Dual Engine Scoring Weights ──────────────────────────

// EV-Optimized Engine: 비인기도 극대화 (검증된 전략)
const EV_W_STRUCTURAL = 0.45;
const EV_W_AC         = 0.15;
const EV_W_ANTIPOP    = 0.40;

// Hybrid Intelligence Engine: 패턴 + NIST/PRNG/ML 융합 (v11.0)
const HYB_W_STRUCTURAL = 0.35;
const HYB_W_AC         = 0.10;
const HYB_W_ANTIPOP    = 0.20;
const HYB_W_PATTERN    = 0.15;
const HYB_W_HYBRID     = 0.20;  // 하이브리드 파이프라인 보너스

/**
 * Generate 5 Expert Pick games — v11.0 Triple Engine
 *
 * Game A, B, C (0-2): EV-Optimized — 비인기도 중심, 패턴 엔진 없음
 * Game D, E (3-4): Hybrid Intelligence — 패턴 + NIST/PRNG/ML 융합
 */
export function generateMultipleExpertPicks(
  draws: LottoDrawResult[],
  timestamp?: number,
  carryoverMisses: number = 0,
  hybridResult?: HybridPipelineResult,
): ExpertPickResult[] {
  // ════════════════════════════════════════════════════════════
  // Stage 0: Smart Data Windowing — 다중 시간 척도 분리
  // ════════════════════════════════════════════════════════════

  const multiScale = buildMultiScaleData(draws);

  // ════════════════════════════════════════════════════════════
  // Stage 1: Population Model — 단기 가중 데이터 사용
  // ════════════════════════════════════════════════════════════

  const unpopVector = computeUnpopularityVector(multiScale.short);

  // ════════════════════════════════════════════════════════════
  // Stage 2: Structural Profile — 중기 가중 Bayesian
  // ════════════════════════════════════════════════════════════

  const structProfile = buildStructuralProfile(multiScale.medium);

  // ════════════════════════════════════════════════════════════
  // Stage 3: Pattern Engine — Game D,E 전용
  //   전체 데이터를 사용하여 4가지 패턴 모델 구축
  // ════════════════════════════════════════════════════════════

  const patternEngine = runPatternEngine(draws);

  const baseSeed = timestamp
    ? (timestamp ^ (timestamp >>> 16)) >>> 0
    : undefined;

  const results: ExpertPickResult[] = [];
  const previousNumbers: number[][] = [];

  for (let game = 0; game < NUM_GAMES; game++) {
    const isEVEngine = game < EV_GAMES;

    const scoreFn: MCMCScoringFn = (combo: number[]) => {
      if (!passesHardConstraints(combo)) return -1000;

      const antiPop = combinationUnpopularity(combo, unpopVector);
      const structural = scoreCombinationStructure(combo, structProfile);
      if (structural.hardReject) return -1000;

      // AC 보너스
      const acNorm = Math.min(structural.acValue / 15, 1.0);
      const acScore = acNorm >= 0.6 ? acNorm : acNorm * 0.5;

      const logStruct = Math.log(Math.max(structural.totalScore, 0.001));
      const logAntiPop = Math.log(Math.max(antiPop, 0.001));

      let score: number;

      if (isEVEngine) {
        // ── EV-Optimized: 비인기도 극대화, 패턴 엔진 없음 ──
        score = logStruct * EV_W_STRUCTURAL
              + acScore * EV_W_AC
              + logAntiPop * EV_W_ANTIPOP;
      } else {
        // ── Hybrid Intelligence: 패턴 + NIST/PRNG/ML 융합 (v11.0) ──
        const patternScore = scoreCombinationPattern(combo, patternEngine);
        const logPattern = Math.log(Math.max(patternScore, 0.001));

        // 하이브리드 파이프라인 보너스
        let hybridBonus = 0;
        if (hybridResult) {
          let hybridSum = 0;
          for (const n of combo) {
            hybridSum += hybridResult.numberScores[n] || 0;
          }
          hybridBonus = hybridSum / combo.length;
        }
        const logHybrid = Math.log(Math.max(hybridBonus, 0.001));

        score = logStruct * HYB_W_STRUCTURAL
              + acScore * HYB_W_AC
              + logAntiPop * HYB_W_ANTIPOP
              + logPattern * HYB_W_PATTERN
              + (hybridResult ? logHybrid * HYB_W_HYBRID : logPattern * 0.20);
      }

      // ── 다양성 패널티: 이전 게임과 겹침 방지 ──
      if (previousNumbers.length > 0) {
        const comboSet = new Set(combo);
        let maxOverlap = 0;
        for (const prev of previousNumbers) {
          let overlap = 0;
          for (const n of prev) {
            if (comboSet.has(n)) overlap++;
          }
          maxOverlap = Math.max(maxOverlap, overlap);
        }
        if (maxOverlap >= 5) score -= DIVERSITY_PENALTY_WEIGHT * 4;
        else if (maxOverlap >= 4) score -= DIVERSITY_PENALTY_WEIGHT * 2;
        else if (maxOverlap >= 3) score -= DIVERSITY_PENALTY_WEIGHT;
      }

      return score;
    };

    const gameSeed = baseSeed !== undefined
      ? (baseSeed + game * 48611) >>> 0
      : undefined;

    const mcmcResult = runMCMC(scoreFn, gameSeed);
    const numbers = mcmcResult.bestCombo;

    previousNumbers.push(numbers);

    // Per-game metadata
    const antiPopScore = combinationUnpopularity(numbers, unpopVector);
    const structScore = scoreCombinationStructure(numbers, structProfile);
    const coWinners = estimateCoWinners(numbers, unpopVector);
    const evResult = calculateExpectedValue(carryoverMisses, coWinners, mcmcResult.converged);
    const jackpot = estimateJackpot(carryoverMisses, coWinners);

    let strategy: StrategyInfo;

    if (isEVEngine) {
      // EV-Optimized 메타데이터
      strategy = {
        algorithmVersion: ALGORITHM_VERSION,
        engine: 'ev-optimized',
        factorSummary: `EV-Optimized ${APP_VERSION} (${mcmcResult.method}) — antipop=${round2(antiPopScore)} struct=${round2(structScore.totalScore)}`,
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
    } else {
      // Hybrid Intelligence 메타데이터 (v11.0)
      const patternScore = scoreCombinationPattern(numbers, patternEngine);
      const patternDetails = buildPatternDetails(numbers, patternEngine);

      // 하이브리드 파이프라인 점수 계산
      let hybridPipelineScore = 0;
      if (hybridResult) {
        let hSum = 0;
        for (const n of numbers) hSum += hybridResult.numberScores[n] || 0;
        hybridPipelineScore = round2(hSum / numbers.length);
      }

      strategy = {
        algorithmVersion: ALGORITHM_VERSION,
        engine: 'hybrid',
        factorSummary: `Hybrid ${APP_VERSION} (${mcmcResult.method}) — pattern[M${round2(patternDetails.markov)}/D${round2(patternDetails.dormancy)}/V${round2(patternDetails.momentum)}/P${round2(patternDetails.pair)}]${hybridResult ? ` hybrid=${hybridPipelineScore}` : ''}`,
        populationAvoidanceScore: round2(antiPopScore),
        structuralFitScore: round2(structScore.totalScore),
        patternIntelligenceScore: round2(patternScore),
        patternDetails,
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
        hybridPipelineScore: hybridResult ? hybridPipelineScore : undefined,
        randomnessVerdict: hybridResult?.nistResult.verdict,
        prngDetected: hybridResult?.prngResult.predictable,
      };
    }

    results.push({ numbers, strategy });
  }

  return results;
}

/**
 * Expert Pick — single game (backward compatible)
 */
export function generateExpertPick(
  draws: LottoDrawResult[],
  timestamp?: number,
  carryoverMisses: number = 0,
): ExpertPickResult {
  return generateMultipleExpertPicks(draws, timestamp, carryoverMisses)[0];
}

// ─── Pattern Details Builder ─────────────────────────────────────

interface PatternDetailScores {
  markov: number;
  dormancy: number;
  momentum: number;
  pair: number;
  awakeningNumbers: number[];
  risingNumbers: number[];
}

function buildPatternDetails(
  combo: number[],
  engine: PatternEngineResult,
): PatternDetailScores {
  let markov = 0;
  for (const n of combo) {
    markov += engine.markov.transitionScores.get(n) || 0;
  }
  markov /= combo.length;

  let dormancy = 0;
  const awakeningNumbers: number[] = [];
  for (const n of combo) {
    const s = engine.dormancy.awakeningScores.get(n) || 0;
    dormancy += s;
    if (s > 0.7) awakeningNumbers.push(n);
  }
  dormancy /= combo.length;

  let momentum = 0;
  const risingNumbers: number[] = [];
  for (const n of combo) {
    const m = engine.momentum.momentum.get(n) || 0;
    momentum += m;
    if (m > 0.3) risingNumbers.push(n);
  }
  momentum /= combo.length;

  let totalZ = 0;
  for (let i = 0; i < combo.length; i++) {
    for (let j = i + 1; j < combo.length; j++) {
      totalZ += engine.pairAffinity.zGrid[combo[i]][combo[j]];
    }
  }
  const pair = 1 / (1 + Math.exp(-(totalZ / 15) * 0.5));

  return {
    markov: round2(markov),
    dormancy: round2(dormancy),
    momentum: round2(momentum),
    pair: round2(pair),
    awakeningNumbers,
    risingNumbers,
  };
}

// ─── Utilities ──────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  if (isNaN(n)) return NaN;
  return Math.round(n * 1000) / 1000;
}
