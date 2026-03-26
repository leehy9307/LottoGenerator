/**
 * prngDetector.ts — PRNG 탐지 모듈
 * 로또 추첨 시퀀스에서 알려진 PRNG 패턴을 탐지
 * v11.0
 */

import {
  combinatorialRank,
  combinatorialUnrank,
  gcdBig,
  modInverseBig,
  berlekampMassey,
  latticeReduce2D,
  binomial,
} from './mathUtils';
import type { LottoDrawResult } from '../types/lotto';

// ============================================================
// 결과 인터페이스 (Result Interfaces)
// ============================================================

export interface LCGDetectionResult {
  detected: boolean;
  confidence: number;
  parameters?: { a: number; c: number; m: number };
  predictedNext?: number;
}

export interface TruncatedLCGResult {
  detected: boolean;
  confidence: number;
  suspectedModulus?: number;
}

export interface LFSRDetectionResult {
  detected: boolean;
  confidence: number;
  linearComplexity: number;
  sequenceLength: number;
  ratio: number;
  polynomial?: number[];
}

export interface MTDetectionResult {
  feasible: false;
  reason: string;
  partialAnalysis: {
    mod3Distribution: number[];
    mod5Distribution: number[];
    mod7Distribution: number[];
    uniformityScore: number;
  };
}

export interface AutocorrelationResult {
  correlations: { lag: number; value: number; significant: boolean }[];
  detectedPeriod: number | null;
  maxCorrelation: number;
}

export interface SpectralTestResult {
  dimensions: { dim: number; normalizedScore: number; quality: string }[];
  overallScore: number;
}

export interface PRNGDetectionResult {
  lcg: LCGDetectionResult;
  truncatedLcg: TruncatedLCGResult;
  lfsr: LFSRDetectionResult;
  mersenneTwister: MTDetectionResult;
  autocorrelation: AutocorrelationResult;
  spectral: SpectralTestResult;
  verdict:
    | 'none_detected'
    | 'lcg_suspected'
    | 'lfsr_suspected'
    | 'periodic_detected'
    | 'unknown_structure';
  confidence: number;       // 전체 탐지 신뢰도 (0~1)
  predictable: boolean;     // 수학적 예측 가능 여부
  nextPrediction?: number[]; // 예측된 다음 번호 (6개)
}

// ============================================================
// 1. LCG 탐지 (Linear Congruential Generator)
// ============================================================

/**
 * LCG 탐지기: x_{n+1} = (a * x_n + c) mod m
 * 연속 차분과 GCD로 모듈러스를 복원한 후 매개변수를 추정
 */
export function detectLCG(sequence: number[]): LCGDetectionResult {
  if (sequence.length < 6) {
    return { detected: false, confidence: 0 };
  }

  // 연속 차분 계산
  const diffs: bigint[] = [];
  for (let i = 0; i < sequence.length - 1; i++) {
    diffs.push(BigInt(sequence[i + 1]) - BigInt(sequence[i]));
  }

  // GCD 기반 모듈러스 복원: m | gcd(d_{i+1}*d_{i-1} - d_i^2)
  const candidates: bigint[] = [];
  for (let i = 1; i < diffs.length - 1; i++) {
    const val = diffs[i + 1] * diffs[i - 1] - diffs[i] * diffs[i];
    if (val !== 0n) {
      candidates.push(val < 0n ? -val : val);
    }
  }

  if (candidates.length < 2) {
    return { detected: false, confidence: 0 };
  }

  // 후보들의 GCD로 모듈러스 추정
  let mBig = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    mBig = gcdBig(mBig, candidates[i]);
  }

  if (mBig <= 1n) {
    return { detected: false, confidence: 0 };
  }

  // 모듈러스가 너무 크면 제한
  if (mBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { detected: false, confidence: 0 };
  }

  const m = Number(mBig);

  // a 복원: a = d_1 * modInverse(d_0, m)
  const d0Big = ((diffs[0] % mBig) + mBig) % mBig;
  const d1Big = ((diffs[1] % mBig) + mBig) % mBig;

  const invD0 = modInverseBig(d0Big, mBig);
  if (invD0 === null) {
    return { detected: false, confidence: 0 };
  }

  const aBig = (d1Big * invD0) % mBig;
  const a = Number(aBig);

  // c 복원: c = (x_1 - a * x_0) mod m
  const x0Big = ((BigInt(sequence[0]) % mBig) + mBig) % mBig;
  const x1Big = ((BigInt(sequence[1]) % mBig) + mBig) % mBig;
  const cBig = ((x1Big - aBig * x0Big) % mBig + mBig) % mBig;
  const c = Number(cBig);

  // 검증: 시퀀스의 나머지 값들을 예측
  let correct = 0;
  const total = Math.min(sequence.length - 1, 20);
  let xCur = x0Big;

  for (let i = 0; i < total; i++) {
    const xNext = (aBig * xCur + cBig) % mBig;
    const expected = Number(xNext);
    const actual = ((BigInt(sequence[i + 1]) % mBig) + mBig) % mBig;
    if (expected === Number(actual)) {
      correct++;
    }
    xCur = xNext;
  }

  const accuracy = correct / total;
  const detected = accuracy > 0.8;
  const confidence = accuracy;

  // 다음 값 예측
  let predictedNext: number | undefined;
  if (detected) {
    const lastBig = ((BigInt(sequence[sequence.length - 1]) % mBig) + mBig) % mBig;
    predictedNext = Number((aBig * lastBig + cBig) % mBig);
  }

  return {
    detected,
    confidence,
    parameters: detected ? { a, c, m } : undefined,
    predictedNext,
  };
}

// ============================================================
// 2. 절단 LCG 탐지 (Truncated LCG)
// ============================================================

/**
 * 절단 LCG 탐지기
 * LCG 출력의 상위 비트만 관찰 가능한 경우, 격자 축소로 탐지
 */
export function detectTruncatedLCG(sequence: number[]): TruncatedLCGResult {
  if (sequence.length < 4) {
    return { detected: false, confidence: 0 };
  }

  const commonModuli = [2147483647, 4294967296, 2147483648]; // 2^31-1, 2^32, 2^31
  let bestConfidence = 0;
  let bestModulus: number | undefined;

  for (const m of commonModuli) {
    const sqrtM = Math.sqrt(m);
    let suspiciousCount = 0;
    const pairCount = Math.min(sequence.length - 1, 20);

    for (let i = 0; i < pairCount; i++) {
      const v1: [number, number] = [sequence[i], sequence[i + 1]];
      const v2: [number, number] = [m, 0];

      const { reduced } = latticeReduce2D(v1, v2);
      const shortestNorm = Math.sqrt(
        reduced[0][0] * reduced[0][0] + reduced[0][1] * reduced[0][1]
      );

      // 축소된 벡터가 sqrt(m)보다 현저히 짧으면 의심
      if (shortestNorm < sqrtM * 0.1) {
        suspiciousCount++;
      }
    }

    const confidence = suspiciousCount / pairCount;
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestModulus = m;
    }
  }

  const detected = bestConfidence > 0.5;

  return {
    detected,
    confidence: bestConfidence,
    suspectedModulus: detected ? bestModulus : undefined,
  };
}

// ============================================================
// 3. LFSR 탐지 (Linear Feedback Shift Register)
// ============================================================

/**
 * LFSR 탐지기
 * Berlekamp-Massey 알고리즘으로 선형 복잡도를 계산하여 LFSR 여부 판단
 */
export function detectLFSR(bits: number[]): LFSRDetectionResult {
  const n = bits.length;

  if (n < 10) {
    return {
      detected: false,
      confidence: 0,
      linearComplexity: 0,
      sequenceLength: n,
      ratio: 0,
    };
  }

  const { complexity, polynomial } = berlekampMassey(bits);
  const ratio = complexity / n;

  // L < n/3 이면 LFSR로 판단
  const detected = complexity < n / 3;

  // 신뢰도: ratio가 0.5에서 멀수록 높은 신뢰도
  // LFSR이면 ratio가 0에 가까움, 랜덤이면 0.5에 가까움
  let confidence: number;
  if (detected) {
    confidence = Math.min(1, (1 - 2 * ratio) * 1.2);
  } else {
    confidence = 0;
  }

  return {
    detected,
    confidence: Math.max(0, confidence),
    linearComplexity: complexity,
    sequenceLength: n,
    ratio,
    polynomial: detected ? polynomial : undefined,
  };
}

// ============================================================
// 4. 메르센 트위스터 탐지 (Mersenne Twister)
// ============================================================

/**
 * MT19937 탐지기
 * 로또 데이터로는 완전한 상태 복원이 불가하므로 부분 분석만 수행
 */
export function detectMersenneTwister(sequence: number[]): MTDetectionResult {
  // 소수 mod 분포 분석
  const mod3 = [0, 0, 0];
  const mod5 = [0, 0, 0, 0, 0];
  const mod7 = [0, 0, 0, 0, 0, 0, 0];

  for (const val of sequence) {
    mod3[val % 3]++;
    mod5[val % 5]++;
    mod7[val % 7]++;
  }

  const n = sequence.length;

  // 균일성 점수: 각 mod 분포가 얼마나 균일한지 카이제곱 계산
  const chiSqMod = (observed: number[], k: number): number => {
    const expected = n / k;
    let chi2 = 0;
    for (let i = 0; i < k; i++) {
      chi2 += (observed[i] - expected) ** 2 / expected;
    }
    return chi2;
  };

  const chi3 = chiSqMod(mod3, 3);
  const chi5 = chiSqMod(mod5, 5);
  const chi7 = chiSqMod(mod7, 7);

  // 자유도별 임계값 (p=0.05): df=2 → 5.99, df=4 → 9.49, df=6 → 12.59
  // 균일성 점수: 세 검정 모두 통과하면 1.0에 가까움
  const pass3 = chi3 < 5.99 ? 1 : 0;
  const pass5 = chi5 < 9.49 ? 1 : 0;
  const pass7 = chi7 < 12.59 ? 1 : 0;
  const uniformityScore = (pass3 + pass5 + pass7) / 3;

  return {
    feasible: false,
    reason:
      'MT19937 상태 복원에는 624개의 연속 32비트 출력이 필요합니다. ' +
      '로또 데이터(1-45 범위)로는 충분한 정보를 추출할 수 없습니다.',
    partialAnalysis: {
      mod3Distribution: mod3,
      mod5Distribution: mod5,
      mod7Distribution: mod7,
      uniformityScore,
    },
  };
}

// ============================================================
// 5. 자기상관 검정 (Autocorrelation Test)
// ============================================================

/**
 * 자기상관 검정
 * 시퀀스의 주기성을 탐지
 */
export function autocorrelationTest(
  sequence: number[],
  maxLag: number = 50
): AutocorrelationResult {
  const n = sequence.length;
  if (n < 4) {
    return { correlations: [], detectedPeriod: null, maxCorrelation: 0 };
  }

  // 평균 계산
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sequence[i];
  const mean = sum / n;

  // 분산 계산 (분모)
  let variance = 0;
  for (let i = 0; i < n; i++) {
    variance += (sequence[i] - mean) ** 2;
  }

  if (variance === 0) {
    return { correlations: [], detectedPeriod: null, maxCorrelation: 0 };
  }

  const effectiveMaxLag = Math.min(maxLag, Math.floor(n / 2));
  const threshold = 1.96 / Math.sqrt(n); // 95% 유의수준

  const correlations: { lag: number; value: number; significant: boolean }[] = [];
  let maxAbsCorr = 0;
  let detectedPeriod: number | null = null;

  for (let k = 1; k <= effectiveMaxLag; k++) {
    // r(k) = Σ((x_i - mean)(x_{i+k} - mean)) / Σ(x_i - mean)²
    let covariance = 0;
    for (let i = 0; i < n - k; i++) {
      covariance += (sequence[i] - mean) * (sequence[i + k] - mean);
    }

    const rk = covariance / variance;
    const significant = Math.abs(rk) > threshold;

    correlations.push({ lag: k, value: rk, significant });

    if (Math.abs(rk) > maxAbsCorr) {
      maxAbsCorr = Math.abs(rk);
    }
  }

  // 주기성 탐지: 유의한 피크 중 첫 번째 양의 피크
  for (const c of correlations) {
    if (c.significant && c.value > 0 && c.lag > 1) {
      detectedPeriod = c.lag;
      break;
    }
  }

  return {
    correlations,
    detectedPeriod,
    maxCorrelation: maxAbsCorr,
  };
}

// ============================================================
// 6. 스펙트럼 검정 (Spectral Test)
// ============================================================

/**
 * 스펙트럼 검정
 * 다차원 공간에서의 격자 구조를 탐지
 */
export function spectralTest(
  sequence: number[],
  maxDim: number = 6
): SpectralTestResult {
  const n = sequence.length;
  const dimensions: { dim: number; normalizedScore: number; quality: string }[] = [];

  for (let d = 2; d <= Math.min(maxDim, 8); d++) {
    if (n < d + 1) break;

    let normalizedScore: number;

    if (d === 2) {
      // 2차원: 격자 축소로 최단 벡터 계산
      normalizedScore = spectral2D(sequence);
    } else {
      // d > 2: d-tuple 균일성 기반 간소화 분석
      normalizedScore = spectralHigherDim(sequence, d);
    }

    const quality =
      normalizedScore > 0.8
        ? 'good'
        : normalizedScore > 0.5
          ? 'acceptable'
          : normalizedScore > 0.2
            ? 'poor'
            : 'failing';

    dimensions.push({ dim: d, normalizedScore, quality });
  }

  // 전체 점수: 각 차원 점수의 기하 평균
  const overallScore =
    dimensions.length > 0
      ? Math.pow(
          dimensions.reduce((p, d) => p * Math.max(d.normalizedScore, 0.001), 1),
          1 / dimensions.length
        )
      : 0;

  return { dimensions, overallScore };
}

/**
 * 2차원 스펙트럼 분석: 격자 축소로 최단 벡터를 구해 정규화
 */
function spectral2D(sequence: number[]): number {
  const n = sequence.length;
  if (n < 3) return 1;

  // 여러 쌍에 대해 격자 축소 수행
  const sampleSize = Math.min(n - 1, 30);
  let totalNorm = 0;

  // 시퀀스 범위 추정
  let maxVal = 0;
  for (let i = 0; i < n; i++) {
    if (sequence[i] > maxVal) maxVal = sequence[i];
  }

  for (let i = 0; i < sampleSize; i++) {
    const v1: [number, number] = [sequence[i], sequence[i + 1]];
    const v2: [number, number] = [maxVal + 1, 0];

    const { reduced } = latticeReduce2D(v1, v2);
    const norm = Math.sqrt(
      reduced[0][0] * reduced[0][0] + reduced[0][1] * reduced[0][1]
    );
    totalNorm += norm;
  }

  const avgNorm = totalNorm / sampleSize;
  // 이론적 최대 거리: sqrt(maxVal)에 비례
  const theoreticalMax = Math.sqrt(maxVal + 1);
  const normalized = Math.min(1, avgNorm / theoreticalMax);

  return normalized;
}

/**
 * 고차원 스펙트럼 분석: d-tuple 균일성 검정
 */
function spectralHigherDim(sequence: number[], d: number): number {
  const n = sequence.length;
  const tupleCount = n - d + 1;
  if (tupleCount < 10) return 1;

  // d-tuple을 그리드 셀에 매핑하여 균일성 검사
  const gridSize = Math.max(2, Math.floor(Math.pow(tupleCount, 1 / d)));
  let maxVal = 0;
  for (let i = 0; i < n; i++) {
    if (sequence[i] > maxVal) maxVal = sequence[i];
  }

  const cellSize = (maxVal + 1) / gridSize;
  const totalCells = Math.pow(gridSize, d);
  const cellCounts = new Map<string, number>();

  for (let i = 0; i <= n - d; i++) {
    const cellIdx: number[] = [];
    for (let j = 0; j < d; j++) {
      cellIdx.push(Math.min(gridSize - 1, Math.floor(sequence[i + j] / cellSize)));
    }
    const key = cellIdx.join(',');
    cellCounts.set(key, (cellCounts.get(key) || 0) + 1);
  }

  // 카이제곱 통계량으로 균일성 측정
  const expected = tupleCount / totalCells;
  let chi2 = 0;
  const filledCells = cellCounts.size;

  cellCounts.forEach((count) => {
    chi2 += (count - expected) ** 2 / expected;
  });
  // 비어있는 셀도 고려
  const emptyCells = totalCells - filledCells;
  chi2 += emptyCells * expected; // 각 빈 셀에서 (0 - expected)² / expected = expected

  // 자유도: totalCells - 1
  const df = Math.max(1, totalCells - 1);
  // 정규화: 카이제곱 / df가 1이면 완전 균일, 클수록 나쁨
  const ratio = chi2 / df;
  // 점수: ratio가 1에 가까우면 1.0, 커지면 0에 수렴
  const score = Math.exp(-Math.max(0, ratio - 1) * 0.5);

  return Math.min(1, Math.max(0, score));
}

// ============================================================
// 7. 통합 PRNG 탐지 (Orchestrator)
// ============================================================

/**
 * 모든 PRNG 탐지기를 실행하고 결과를 종합
 */
export function runPRNGDetection(draws: LottoDrawResult[]): PRNGDetectionResult {
  if (draws.length < 3) {
    return emptyResult();
  }

  // 데이터 인코딩: 조합 랭크 시퀀스
  const rankSequence = draws.map((d) =>
    combinatorialRank(d.numbers, 45, 6)
  );

  // 이진 시퀀스 생성 (LFSR 분석용)
  const bitSequence = drawsToBits(draws);

  // 모든 탐지기 실행
  const lcg = detectLCG(rankSequence);
  const truncatedLcg = detectTruncatedLCG(rankSequence);
  const lfsr = detectLFSR(bitSequence);
  const mersenneTwister = detectMersenneTwister(rankSequence);
  const autocorrelation = autocorrelationTest(rankSequence);
  const spectral = spectralTest(rankSequence);

  // 판정
  let verdict: PRNGDetectionResult['verdict'] = 'none_detected';
  if (lcg.detected) {
    verdict = 'lcg_suspected';
  } else if (lfsr.detected) {
    verdict = 'lfsr_suspected';
  } else if (autocorrelation.detectedPeriod !== null) {
    verdict = 'periodic_detected';
  } else if (spectral.overallScore < 0.3) {
    verdict = 'unknown_structure';
  }

  // 전체 신뢰도 및 예측 가능성 판정
  const anyDetected = lcg.detected || lfsr.detected;
  const confidence = Math.max(lcg.confidence, lfsr.confidence, truncatedLcg.confidence);
  const predictable = anyDetected && confidence > 0.7;

  // 다음 번호 예측 시도
  let nextPrediction: number[] | undefined;
  if (lcg.detected && lcg.predictedNext !== undefined) {
    const totalCombinations = binomial(45, 6);
    const clampedRank = Math.max(
      0,
      Math.min(totalCombinations - 1, lcg.predictedNext)
    );
    nextPrediction = combinatorialUnrank(clampedRank, 45, 6);
  }

  return {
    lcg,
    truncatedLcg,
    lfsr,
    mersenneTwister,
    autocorrelation,
    spectral,
    verdict,
    confidence,
    predictable,
    nextPrediction,
  };
}

// ============================================================
// 내부 유틸리티
// ============================================================

/**
 * 추첨 결과를 이진 시퀀스로 변환 (45비트 벡터 → 연결)
 */
function drawsToBits(draws: LottoDrawResult[]): number[] {
  const bits: number[] = [];
  for (const draw of draws) {
    for (let num = 1; num <= 45; num++) {
      bits.push(draw.numbers.includes(num) ? 1 : 0);
    }
  }
  return bits;
}

/**
 * 빈 결과 (데이터 부족 시)
 */
function emptyResult(): PRNGDetectionResult {
  return {
    lcg: { detected: false, confidence: 0 },
    truncatedLcg: { detected: false, confidence: 0 },
    lfsr: {
      detected: false,
      confidence: 0,
      linearComplexity: 0,
      sequenceLength: 0,
      ratio: 0,
    },
    mersenneTwister: {
      feasible: false,
      reason: '분석할 데이터가 부족합니다.',
      partialAnalysis: {
        mod3Distribution: [],
        mod5Distribution: [],
        mod7Distribution: [],
        uniformityScore: 0,
      },
    },
    autocorrelation: { correlations: [], detectedPeriod: null, maxCorrelation: 0 },
    spectral: { dimensions: [], overallScore: 0 },
    verdict: 'none_detected',
    confidence: 0,
    predictable: false,
  };
}
