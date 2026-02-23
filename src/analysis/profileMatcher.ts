import { LottoDrawResult } from '../types/lotto';

/**
 * Winning Profile Matching — 역대 당첨조합의 구조적 프로필 매칭
 *
 * 당첨 조합의 구조적 특성을 통계적으로 프로파일링하고,
 * 후보 조합이 역대 당첨 패턴과 얼마나 유사한지 점수화
 */

export interface WinningProfile {
  sumMean: number;          // 합계 평균
  sumStd: number;           // 합계 표준편차
  consecutivePairRate: number;  // 연속쌍 포함 비율 (0~1)
  gapMean: number;          // 번호 간 평균 갭
  gapStd: number;           // 번호 간 갭 표준편차
  decadeDistribution: number[]; // 10단위 분포 (5개 구간)
  oddRateMean: number;      // 평균 홀수 비율
  oddRateStd: number;       // 홀수 비율 표준편차
  lowHighRateMean: number;  // 평균 저번호(≤22) 비율
  lowHighRateStd: number;   // 저번호 비율 표준편차
}

/**
 * 역대 당첨조합의 구조적 프로필 구축
 */
export function buildWinningProfile(draws: LottoDrawResult[]): WinningProfile {
  const n = draws.length;

  const sums: number[] = [];
  const consecutivePairs: number[] = []; // 각 추첨의 연속쌍 수
  const gaps: number[] = [];             // 모든 번호 간 갭
  const decadeCounts: number[][] = [];   // 각 추첨의 10단위 분포
  const oddRates: number[] = [];
  const lowHighRates: number[] = [];

  for (const draw of draws) {
    const sorted = [...draw.numbers].sort((a, b) => a - b);

    // 합계
    sums.push(sorted.reduce((a, b) => a + b, 0));

    // 연속쌍 수
    let consCount = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) consCount++;
    }
    consecutivePairs.push(consCount > 0 ? 1 : 0);

    // 갭 (인접 번호 차이)
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i] - sorted[i - 1]);
    }

    // 10단위 분포
    const decades = [0, 0, 0, 0, 0]; // 1-9, 10-19, 20-29, 30-39, 40-45
    for (const num of sorted) {
      const zone = num >= 40 ? 4 : Math.floor((num - 1) / 10);
      decades[zone]++;
    }
    decadeCounts.push(decades);

    // 홀수 비율
    oddRates.push(sorted.filter(n => n % 2 === 1).length / 6);

    // 저번호 비율
    lowHighRates.push(sorted.filter(n => n <= 22).length / 6);
  }

  // 통계량 계산
  const sumMean = mean(sums);
  const sumStd = std(sums);

  const consecutivePairRate = mean(consecutivePairs);

  const gapMean = mean(gaps);
  const gapStd = std(gaps);

  // 10단위 평균 분포
  const decadeDistribution = [0, 0, 0, 0, 0];
  for (const dc of decadeCounts) {
    for (let z = 0; z < 5; z++) {
      decadeDistribution[z] += dc[z];
    }
  }
  for (let z = 0; z < 5; z++) {
    decadeDistribution[z] /= n;
  }

  const oddRateMean = mean(oddRates);
  const oddRateStd = std(oddRates);
  const lowHighRateMean = mean(lowHighRates);
  const lowHighRateStd = std(lowHighRates);

  return {
    sumMean, sumStd,
    consecutivePairRate,
    gapMean, gapStd,
    decadeDistribution,
    oddRateMean, oddRateStd,
    lowHighRateMean, lowHighRateStd,
  };
}

/**
 * 후보 조합의 프로필 일치도 0~1 계산
 *
 * 각 특성이 역대 당첨 프로필의 평균으로부터 벗어난 정도를
 * 표준편차 기준으로 측정하여, z-score 기반 일치도로 변환
 */
export function scoreCombinationProfile(
  combination: number[],
  profile: WinningProfile,
): number {
  const sorted = [...combination].sort((a, b) => a - b);
  const penalties: number[] = [];

  // (1) 합계 일치도 — 가장 중요 (가중치 30%)
  const sum = sorted.reduce((a, b) => a + b, 0);
  const sumZ = Math.abs(sum - profile.sumMean) / (profile.sumStd || 1);
  penalties.push(gaussianScore(sumZ) * 0.30);

  // (2) 연속쌍 — 있는지 여부와 역대 비율 비교 (가중치 10%)
  let hasConsecutive = false;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      hasConsecutive = true;
      break;
    }
  }
  const consScore = hasConsecutive
    ? profile.consecutivePairRate
    : (1 - profile.consecutivePairRate);
  penalties.push(consScore * 0.10);

  // (3) 갭 패턴 일치도 (가중치 15%)
  const gapValues: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gapValues.push(sorted[i] - sorted[i - 1]);
  }
  const avgGap = mean(gapValues);
  const gapZ = Math.abs(avgGap - profile.gapMean) / (profile.gapStd || 1);
  penalties.push(gaussianScore(gapZ) * 0.15);

  // (4) 10단위 분포 일치도 — 코사인 유사도 (가중치 20%)
  const decades = [0, 0, 0, 0, 0];
  for (const num of sorted) {
    const zone = num >= 40 ? 4 : Math.floor((num - 1) / 10);
    decades[zone]++;
  }
  const cosSim = cosineSimilarity(decades, profile.decadeDistribution);
  penalties.push(cosSim * 0.20);

  // (5) 홀수 비율 (가중치 15%)
  const oddRate = sorted.filter(n => n % 2 === 1).length / 6;
  const oddZ = Math.abs(oddRate - profile.oddRateMean) / (profile.oddRateStd || 1);
  penalties.push(gaussianScore(oddZ) * 0.15);

  // (6) 저번호 비율 (가중치 10%)
  const lowRate = sorted.filter(n => n <= 22).length / 6;
  const lowZ = Math.abs(lowRate - profile.lowHighRateMean) / (profile.lowHighRateStd || 1);
  penalties.push(gaussianScore(lowZ) * 0.10);

  return penalties.reduce((a, b) => a + b, 0);
}

// ─── 유틸리티 ────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) * (x - m), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * z-score를 0~1 가우시안 점수로 변환
 * z=0 → 1.0, z=1 → 0.607, z=2 → 0.135, z=3 → 0.011
 */
function gaussianScore(z: number): number {
  return Math.exp(-0.5 * z * z);
}

/**
 * 코사인 유사도 (0~1)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator > 0 ? dotProduct / denominator : 0;
}
