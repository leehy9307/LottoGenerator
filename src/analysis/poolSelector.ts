import { LottoDrawResult } from '../types/lotto';
import {
  adaptiveFrequencyScore,
  bayesianPosteriorScore,
  momentumTrendScore,
  markovTransitionScore,
  monteCarloScore,
} from './advancedModels';
import { spectralAnalysisScore } from './spectralModel';
import { networkCentralityScore } from './networkModel';
import { quantumInterferenceScore, hybridFusion } from './quantumScoring';
import { findOptimalPoolSize } from './coverageOptimizer';

/**
 * v5.0 Pool Selector — 7-Model Ensemble + Hybrid Fusion + Dynamic Pool Sizing
 *
 * Phase 1: 45개 번호를 7개 모델로 평가
 *   → RRF + Quantum Interference Fusion
 *   → Dynamic Pool Sizing (한계 EV 분석 → 최적 P*)
 */

export interface PoolSelectionResult {
  pool: number[];               // 선택된 풀 번호들 (정렬됨)
  poolSize: number;             // 풀 크기
  modelAgreement: number;       // 모델 합의도 (0~1)
  modelRanks: Map<string, Map<number, number>>; // 각 모델별 순위
  optimalPoolSize: number;      // 동적 최적 풀 크기
  partialMatchEV: number;       // 부분일치 기대값
}

interface ModelResult {
  name: string;
  scores: Map<number, number>;
}

// ─── Reciprocal Rank Fusion ──────────────────────────────────────

/**
 * RRF(k=60): 각 모델의 순위를 결합하는 앙상블 기법
 *
 * RRF_score(d) = Σ 1 / (k + rank_i(d))
 *
 * k=60은 정보검색(IR) 분야 표준 파라미터로,
 * 높은 순위와 낮은 순위 간 점수 차이를 적절히 완화
 *
 * 장점: 모델 간 점수 스케일이 달라도 순위 기반이므로 공정
 */
export function rankBasedFusion(
  modelResults: ModelResult[],
  k: number = 60,
): Map<number, number> {
  // 각 모델별 순위 계산
  const modelRanks: Map<number, number>[] = [];

  for (const model of modelResults) {
    const entries = Array.from(model.scores.entries());
    entries.sort((a, b) => b[1] - a[1]); // 점수 내림차순

    const ranks = new Map<number, number>();
    for (let rank = 0; rank < entries.length; rank++) {
      ranks.set(entries[rank][0], rank + 1); // 1-indexed rank
    }
    modelRanks.push(ranks);
  }

  // RRF 점수 계산
  const rrfScores = new Map<number, number>();
  for (let i = 1; i <= 45; i++) {
    let rrfScore = 0;
    for (const ranks of modelRanks) {
      const rank = ranks.get(i) || 45;
      rrfScore += 1 / (k + rank);
    }
    rrfScores.set(i, rrfScore);
  }

  return rrfScores;
}

// ─── Model Agreement 계산 ────────────────────────────────────────

/**
 * 7개 모델의 상위 N개 번호 합의도 측정
 *
 * 합의도 = 모든 모델의 Top-N에 공통으로 포함된 번호 비율
 * 완전 합의(모든 모델이 같은 N개) → 1.0
 * 완전 불일치(겹치는 번호 없음) → 0.0 (실질적으로 불가능)
 */
function calculateModelAgreement(
  modelResults: ModelResult[],
  poolSize: number,
): number {
  const modelTopSets: Set<number>[] = [];

  for (const model of modelResults) {
    const entries = Array.from(model.scores.entries());
    entries.sort((a, b) => b[1] - a[1]);
    const topN = new Set(entries.slice(0, poolSize).map(e => e[0]));
    modelTopSets.push(topN);
  }

  // 각 번호가 몇 개 모델의 top-N에 포함되는지 세기
  let totalOverlap = 0;
  for (let i = 1; i <= 45; i++) {
    const inCount = modelTopSets.filter(s => s.has(i)).length;
    if (inCount === modelResults.length) {
      totalOverlap++;
    }
  }

  return totalOverlap / poolSize;
}

// ─── 엔트로피 다양성 체크 ────────────────────────────────────────

/**
 * 풀이 5개 구간(1-9, 10-19, 20-29, 30-39, 40-45)에 충분히 분산되었는지 확인
 * 최소 3개 구간에 번호가 분포해야 함
 */
function checkDiversity(pool: number[]): boolean {
  const zones = new Set<number>();
  for (const n of pool) {
    const zone = n >= 40 ? 4 : Math.floor((n - 1) / 10);
    zones.add(zone);
  }
  return zones.size >= 3;
}

// ─── Pool Selection (메인 함수) ──────────────────────────────────

/**
 * 45개 번호에서 7-Model Ensemble + Hybrid Fusion으로 최적 풀 선택
 *
 * @param draws 역대 추첨 데이터
 * @returns PoolSelectionResult (동적 풀 크기 포함)
 */
export function selectPool(
  draws: LottoDrawResult[],
): PoolSelectionResult {
  // 7개 모델 실행
  const modelResults: ModelResult[] = [
    { name: 'adaptiveFrequency', scores: adaptiveFrequencyScore(draws) },
    { name: 'bayesianPosterior', scores: bayesianPosteriorScore(draws) },
    { name: 'momentumTrend', scores: momentumTrendScore(draws) },
    { name: 'markovTransition', scores: markovTransitionScore(draws) },
    { name: 'monteCarlo', scores: monteCarloScore(draws) },
    { name: 'spectralAnalysis', scores: spectralAnalysisScore(draws) },
    { name: 'networkCentrality', scores: networkCentralityScore(draws) },
  ];

  // RRF 융합
  const rrfScores = rankBasedFusion(modelResults);

  // Quantum Interference 융합
  const interferenceScores = quantumInterferenceScore(modelResults);

  // Hybrid Fusion: 0.6×RRF + 0.4×Interference
  const fusedScores = hybridFusion(rrfScores, interferenceScores);

  // 융합 점수 기준 정렬
  const sorted = Array.from(fusedScores.entries())
    .sort((a, b) => b[1] - a[1]);

  // Dynamic Pool Sizing: 한계 EV 분석으로 최적 풀 크기 결정
  const rankedNumbers = sorted.map(([num, score]) => ({ number: num, score }));
  const { optimalSize, partialMatchEV } = findOptimalPoolSize(rankedNumbers);

  let pool = sorted.slice(0, optimalSize).map(e => e[0]);

  // 다양성 체크 — 부족하면 누락된 구간에서 보충
  if (!checkDiversity(pool)) {
    const inPool = new Set(pool);
    const zones: number[][] = [[], [], [], [], []];
    for (const [num] of sorted) {
      if (inPool.has(num)) continue;
      const zone = num >= 40 ? 4 : Math.floor((num - 1) / 10);
      zones[zone].push(num);
    }

    const poolZones = new Set<number>();
    for (const n of pool) {
      poolZones.add(n >= 40 ? 4 : Math.floor((n - 1) / 10));
    }

    // 비어있는 구간에서 1개씩 추가 (마지막 번호 교체)
    for (let z = 0; z < 5; z++) {
      if (!poolZones.has(z) && zones[z].length > 0) {
        pool[pool.length - 1] = zones[z][0]; // 가장 낮은 순위 번호 교체
        pool = Array.from(new Set(pool));
      }
    }
  }

  pool.sort((a, b) => a - b);

  // 모델 합의도 계산
  const modelAgreement = calculateModelAgreement(modelResults, optimalSize);

  // 모델별 순위 (디버깅/메타데이터 용)
  const modelRanks = new Map<string, Map<number, number>>();
  for (const model of modelResults) {
    const entries = Array.from(model.scores.entries());
    entries.sort((a, b) => b[1] - a[1]);
    const ranks = new Map<number, number>();
    for (let rank = 0; rank < entries.length; rank++) {
      ranks.set(entries[rank][0], rank + 1);
    }
    modelRanks.set(model.name, ranks);
  }

  return {
    pool,
    poolSize: pool.length,
    modelAgreement,
    modelRanks,
    optimalPoolSize: optimalSize,
    partialMatchEV,
  };
}
