/**
 * nistTests.ts — NIST SP 800-22 난수성 검증 테스트 스위트
 * 로또 추첨 데이터의 진정한 무작위성을 통계적으로 검증
 * v11.0
 */

import { LottoDrawResult } from '../types/lotto';
import {
  erfc,
  igamc,
  normalCDF,
  gaussianEliminationGF2,
  ksTestUniform,
  lgamma,
} from './mathUtils';

// ============================================================
// 인터페이스 정의
// ============================================================

export interface NistTestResult {
  testName: string;
  pValue: number;
  passed: boolean; // pValue >= 0.01
  statistic: number;
}

export interface NistSuiteResult {
  tests: NistTestResult[];
  passedCount: number;
  totalTests: number;
  proportionPassed: number;
  pValueUniformity: number; // KS 검정 p-value
  verdict: 'random' | 'suspicious' | 'non-random';
  bitLength: number;
}

// ============================================================
// 데이터 변환
// ============================================================

/**
 * 로또 추첨 데이터를 이진 비트 배열로 변환
 * 각 회차: 45비트 벡터 (번호 i가 추첨되면 bit[i-1] = 1)
 * N회차 → 45×N 비트 배열
 */
export function drawsToBitArray(draws: LottoDrawResult[]): number[] {
  const bits: number[] = [];

  for (const draw of draws) {
    const vec = new Array(45).fill(0);
    for (const num of draw.numbers) {
      vec[num - 1] = 1;
    }
    bits.push(...vec);
  }

  return bits;
}

// ============================================================
// Test 1: Frequency (Monobit) Test
// ============================================================

/**
 * 전체 비트열에서 0과 1의 비율이 거의 동일한지 검사
 * S_n = Σ(2*bit_i - 1), S_obs = |S_n| / √n
 * p-value = erfc(S_obs / √2)
 */
export function frequencyMonobitTest(bits: number[]): NistTestResult {
  const n = bits.length;
  let sum = 0;

  for (let i = 0; i < n; i++) {
    sum += 2 * bits[i] - 1; // +1 for 1, -1 for 0
  }

  const sObs = Math.abs(sum) / Math.sqrt(n);
  const pValue = erfc(sObs / Math.SQRT2);

  return {
    testName: 'Frequency (Monobit)',
    pValue,
    passed: pValue >= 0.01,
    statistic: sObs,
  };
}

// ============================================================
// Test 2: Frequency within a Block Test
// ============================================================

/**
 * 비트열을 M-비트 블록으로 나누고, 각 블록의 1 비율이 0.5에 가까운지 검사
 * 카이제곱 통계량: χ² = 4M Σ(π_i - 0.5)²
 */
export function frequencyBlockTest(
  bits: number[],
  blockSize?: number
): NistTestResult {
  const n = bits.length;
  const M = blockSize || Math.max(20, Math.floor(n / 10));
  const N = Math.floor(n / M); // 블록 수

  if (N === 0) {
    return {
      testName: 'Frequency Block',
      pValue: 1.0,
      passed: true,
      statistic: 0,
    };
  }

  let chiSquare = 0;

  for (let i = 0; i < N; i++) {
    let onesCount = 0;
    for (let j = 0; j < M; j++) {
      onesCount += bits[i * M + j];
    }
    const pi = onesCount / M;
    chiSquare += (pi - 0.5) * (pi - 0.5);
  }
  chiSquare *= 4 * M;

  // p-value = igamc(N/2, chiSquare/2)
  const pValue = igamc(N / 2, chiSquare / 2);

  return {
    testName: 'Frequency Block',
    pValue,
    passed: pValue >= 0.01,
    statistic: chiSquare,
  };
}

// ============================================================
// Test 3: Runs Test
// ============================================================

/**
 * 연속된 동일 비트(run)의 총 개수가 기대값에 가까운지 검사
 * 전제: monobit 비율 π가 |π - 0.5| < 2/√n를 만족해야 함
 */
export function runsTest(bits: number[]): NistTestResult {
  const n = bits.length;

  // 비율 π
  let ones = 0;
  for (let i = 0; i < n; i++) ones += bits[i];
  const pi = ones / n;

  // 전제 조건 검사
  if (Math.abs(pi - 0.5) >= 2 / Math.sqrt(n)) {
    return {
      testName: 'Runs',
      pValue: 0.0,
      passed: false,
      statistic: 0,
    };
  }

  // 런 개수 V_n
  let vObs = 1;
  for (let i = 1; i < n; i++) {
    if (bits[i] !== bits[i - 1]) vObs++;
  }

  // p-value = erfc(|V_n - 2nπ(1-π)| / (2√(2n) * π(1-π)))
  const numerator = Math.abs(vObs - 2 * n * pi * (1 - pi));
  const denominator = 2 * Math.sqrt(2 * n) * pi * (1 - pi);
  const pValue = erfc(numerator / denominator);

  return {
    testName: 'Runs',
    pValue,
    passed: pValue >= 0.01,
    statistic: vObs,
  };
}

// ============================================================
// Test 4: Longest Run of Ones in a Block
// ============================================================

/**
 * 블록 내 1의 최장 연속(longest run)이 이론적 분포를 따르는지 검사
 */
export function longestRunTest(bits: number[]): NistTestResult {
  const n = bits.length;

  // 블록 크기와 기대 분포 선택
  let M: number, K: number;
  let pi: number[];
  let vValues: number[];

  if (n < 128) {
    M = 8;
    K = 3;
    pi = [0.2148, 0.3672, 0.2305, 0.1875];
    vValues = [1, 2, 3, 4]; // v = 1,2,3,>=4
  } else if (n < 6272) {
    M = 128;
    K = 5;
    pi = [0.1174, 0.2430, 0.2493, 0.1752, 0.1027, 0.1124];
    vValues = [4, 5, 6, 7, 8, 9]; // v = <=4,5,6,7,8,>=9
  } else {
    M = 10000;
    K = 6;
    pi = [0.0882, 0.2092, 0.2483, 0.1933, 0.1208, 0.0675, 0.0727];
    vValues = [10, 11, 12, 13, 14, 15, 16]; // v = <=10,...,>=16
  }

  const N = Math.floor(n / M);
  if (N === 0) {
    return {
      testName: 'Longest Run of Ones',
      pValue: 1.0,
      passed: true,
      statistic: 0,
    };
  }

  // 각 블록에서 longest run 계산
  const freq = new Array(K + 1).fill(0);

  for (let i = 0; i < N; i++) {
    let maxRun = 0;
    let currentRun = 0;

    for (let j = 0; j < M; j++) {
      if (bits[i * M + j] === 1) {
        currentRun++;
        if (currentRun > maxRun) maxRun = currentRun;
      } else {
        currentRun = 0;
      }
    }

    // 빈도 분류
    const minV = vValues[0];
    const maxV = vValues[vValues.length - 1];

    if (maxRun <= minV) {
      freq[0]++;
    } else if (maxRun >= maxV) {
      freq[K]++;
    } else {
      for (let k = 1; k < K; k++) {
        if (maxRun === vValues[k]) {
          freq[k]++;
          break;
        }
      }
    }
  }

  // 카이제곱 통계량
  let chiSquare = 0;
  for (let i = 0; i <= K; i++) {
    const expected = N * pi[i];
    chiSquare += ((freq[i] - expected) * (freq[i] - expected)) / expected;
  }

  const pValue = igamc(K / 2, chiSquare / 2);

  return {
    testName: 'Longest Run of Ones',
    pValue,
    passed: pValue >= 0.01,
    statistic: chiSquare,
  };
}

// ============================================================
// Test 5: Binary Matrix Rank Test
// ============================================================

/**
 * 비트열을 32×32 이진 행렬로 나누고, 랭크 분포가 이론값을 따르는지 검사
 * 이론적 확률: P(rank=32)≈0.2888, P(rank=31)≈0.5776, P(rank≤30)≈0.1336
 */
export function binaryMatrixRankTest(bits: number[]): NistTestResult {
  const n = bits.length;
  const Q = 32; // 행
  const M = 32; // 열
  const bitsPerMatrix = Q * M; // 1024
  const N = Math.floor(n / bitsPerMatrix);

  if (N < 1) {
    return {
      testName: 'Binary Matrix Rank',
      pValue: 1.0,
      passed: true,
      statistic: 0,
    };
  }

  let fM = 0; // rank = M (full rank)
  let fM1 = 0; // rank = M - 1
  let fRest = 0; // rank <= M - 2

  for (let k = 0; k < N; k++) {
    // 32×32 행렬 구성
    const matrix: number[][] = [];
    for (let i = 0; i < Q; i++) {
      const row: number[] = [];
      for (let j = 0; j < M; j++) {
        row.push(bits[k * bitsPerMatrix + i * M + j]);
      }
      matrix.push(row);
    }

    const rank = gaussianEliminationGF2(matrix);

    if (rank === M) fM++;
    else if (rank === M - 1) fM1++;
    else fRest++;
  }

  // 이론적 확률
  const p32 = 0.2888;
  const p31 = 0.5776;
  const p30 = 0.1336;

  const chiSquare =
    ((fM - N * p32) * (fM - N * p32)) / (N * p32) +
    ((fM1 - N * p31) * (fM1 - N * p31)) / (N * p31) +
    ((fRest - N * p30) * (fRest - N * p30)) / (N * p30);

  // df = 2
  const pValue = Math.exp(-chiSquare / 2);

  return {
    testName: 'Binary Matrix Rank',
    pValue,
    passed: pValue >= 0.01,
    statistic: chiSquare,
  };
}

// ============================================================
// Test 6: Serial Test
// ============================================================

/**
 * m-비트 겹침 패턴의 빈도 균일성 검사
 * ψ²_m, Δψ²_m, Δ²ψ²_m 통계량 사용
 */
export function serialTest(bits: number[], m?: number): NistTestResult {
  const n = bits.length;
  const blockLen = m || Math.min(5, Math.floor(Math.log2(n)) - 2);

  if (blockLen < 2) {
    return {
      testName: 'Serial',
      pValue: 1.0,
      passed: true,
      statistic: 0,
    };
  }

  // m-비트, (m-1)-비트, (m-2)-비트 패턴 빈도 계산
  const psiSq = (len: number): number => {
    if (len <= 0) return 0;
    const numPatterns = 1 << len; // 2^len
    const counts = new Array(numPatterns).fill(0);

    // 순환 확장 (circular)
    for (let i = 0; i < n; i++) {
      let pattern = 0;
      for (let j = 0; j < len; j++) {
        pattern = (pattern << 1) | bits[(i + j) % n];
      }
      counts[pattern]++;
    }

    let sum = 0;
    for (let i = 0; i < numPatterns; i++) {
      sum += counts[i] * counts[i];
    }

    return (numPatterns / n) * sum - n;
  };

  const psi2_m = psiSq(blockLen);
  const psi2_m1 = psiSq(blockLen - 1);
  const psi2_m2 = psiSq(blockLen - 2);

  const deltaPsi = psi2_m - psi2_m1;
  const delta2Psi = psi2_m - 2 * psi2_m1 + psi2_m2;

  // p-values: igamc(2^(m-2), delta/2) and igamc(2^(m-3), delta2/2)
  const pValue1 = igamc(Math.pow(2, blockLen - 2), Math.abs(deltaPsi) / 2);
  const pValue2 = igamc(Math.pow(2, blockLen - 3), Math.abs(delta2Psi) / 2);

  // 두 p-value 중 작은 값을 사용
  const pValue = Math.min(pValue1, pValue2);

  return {
    testName: 'Serial',
    pValue,
    passed: pValue >= 0.01,
    statistic: deltaPsi,
  };
}

// ============================================================
// Test 7: Approximate Entropy Test
// ============================================================

/**
 * m-비트와 (m+1)-비트 패턴의 엔트로피 차이가 기대값에 가까운지 검사
 * ApEn = φ_m - φ_{m+1}
 */
export function approximateEntropyTest(
  bits: number[],
  m?: number
): NistTestResult {
  const n = bits.length;
  const blockLen = m || Math.min(4, Math.floor(Math.log2(n)) - 5);

  if (blockLen < 1) {
    return {
      testName: 'Approximate Entropy',
      pValue: 1.0,
      passed: true,
      statistic: 0,
    };
  }

  const phi = (len: number): number => {
    const numPatterns = 1 << len;
    const counts = new Array(numPatterns).fill(0);

    // 순환 확장
    for (let i = 0; i < n; i++) {
      let pattern = 0;
      for (let j = 0; j < len; j++) {
        pattern = (pattern << 1) | bits[(i + j) % n];
      }
      counts[pattern]++;
    }

    let sum = 0;
    for (let i = 0; i < numPatterns; i++) {
      if (counts[i] > 0) {
        const pi = counts[i] / n;
        sum += pi * Math.log(pi);
      }
    }

    return sum;
  };

  const phi_m = phi(blockLen);
  const phi_m1 = phi(blockLen + 1);
  const apEn = phi_m - phi_m1;

  // χ² = 2n [ln2 - ApEn]
  const chiSquare = 2 * n * (Math.LN2 - apEn);
  const df = Math.pow(2, blockLen);
  const pValue = igamc(df / 2, chiSquare / 2);

  return {
    testName: 'Approximate Entropy',
    pValue,
    passed: pValue >= 0.01,
    statistic: chiSquare,
  };
}

// ============================================================
// Test 8: Cumulative Sums Test
// ============================================================

/**
 * 누적합의 최대 절대값이 기대 범위 내에 있는지 검사
 * 전진(forward) + 후진(reverse) 모드
 */
export function cumulativeSumsTest(bits: number[]): NistTestResult {
  const n = bits.length;

  const testOneDirection = (forward: boolean): number => {
    let sum = 0;
    let maxExcursion = 0;

    for (let i = 0; i < n; i++) {
      const idx = forward ? i : n - 1 - i;
      sum += 2 * bits[idx] - 1;
      if (Math.abs(sum) > maxExcursion) {
        maxExcursion = Math.abs(sum);
      }
    }

    const z = maxExcursion;

    // p-value 계산 (급수 전개)
    let pValue = 0;
    const sqrtN = Math.sqrt(n);

    // 첫 번째 합
    const kStart1 = Math.floor((-n / z + 1) / 4);
    const kEnd1 = Math.floor((n / z - 1) / 4);
    for (let k = kStart1; k <= kEnd1; k++) {
      pValue += normalCDF(((4 * k + 1) * z) / sqrtN);
      pValue -= normalCDF(((4 * k - 1) * z) / sqrtN);
    }

    // 두 번째 합
    const kStart2 = Math.floor((-n / z - 3) / 4);
    const kEnd2 = Math.floor((n / z - 1) / 4);
    for (let k = kStart2; k <= kEnd2; k++) {
      pValue -= normalCDF(((4 * k + 3) * z) / sqrtN);
      pValue += normalCDF(((4 * k + 1) * z) / sqrtN);
    }

    return 1 - pValue;
  };

  const pForward = testOneDirection(true);
  const pReverse = testOneDirection(false);

  // 두 방향 중 작은 p-value
  const pValue = Math.min(pForward, pReverse);

  // 통계량은 forward 방향의 최대 편향
  let sum = 0;
  let maxZ = 0;
  for (let i = 0; i < n; i++) {
    sum += 2 * bits[i] - 1;
    if (Math.abs(sum) > maxZ) maxZ = Math.abs(sum);
  }

  return {
    testName: 'Cumulative Sums',
    pValue: Math.max(0, Math.min(1, pValue)),
    passed: pValue >= 0.01,
    statistic: maxZ,
  };
}

// ============================================================
// Test 9: Random Excursions (Simplified)
// ============================================================

/**
 * 랜덤 워크의 사이클 내 상태 방문 빈도가 이론값을 따르는지 검사
 * 간소화: 상태 {-2, -1, 1, 2}에 대해서만 검사
 */
export function randomExcursionsSimplified(bits: number[]): NistTestResult {
  const n = bits.length;

  // 누적합 (랜덤 워크)
  const walk: number[] = [0];
  for (let i = 0; i < n; i++) {
    walk.push(walk[walk.length - 1] + (2 * bits[i] - 1));
  }

  // 원점(0) 복귀점 찾기 → 사이클 구분
  const zeros: number[] = [0];
  for (let i = 1; i < walk.length; i++) {
    if (walk[i] === 0) zeros.push(i);
  }
  // 마지막에 원점이 아니면 추가
  if (walk[walk.length - 1] !== 0) {
    zeros.push(walk.length - 1);
  }

  const J = zeros.length - 1; // 사이클 수

  // 최소 사이클 수: 500비트 이상, 사이클 8개 이상
  if (n < 500 || J < 8) {
    return {
      testName: 'Random Excursions (Simplified)',
      pValue: 1.0,
      passed: true,
      statistic: 0,
    };
  }

  // 상태 {-2, -1, 1, 2}에 대해 사이클별 방문 횟수 집계
  const states = [-2, -1, 1, 2];
  let minPValue = 1.0;
  let testStat = 0;

  for (const x of states) {
    // 각 사이클에서 상태 x 방문 횟수
    const cycleCounts: number[] = [];

    for (let c = 0; c < J; c++) {
      let count = 0;
      for (let i = zeros[c] + 1; i <= zeros[c + 1]; i++) {
        if (walk[i] === x) count++;
      }
      cycleCounts.push(count);
    }

    // 방문 횟수를 0, 1, 2, 3, 4, >=5로 분류
    const freq = [0, 0, 0, 0, 0, 0]; // k = 0,1,2,3,4,>=5
    for (const cnt of cycleCounts) {
      if (cnt >= 5) freq[5]++;
      else freq[cnt]++;
    }

    // 이론적 확률 (상태 |x|에 대한 근사)
    const absX = Math.abs(x);
    const pi: number[] = [];
    for (let k = 0; k <= 5; k++) {
      if (k === 0) {
        pi.push(1 - 1 / (2 * absX));
      } else if (k < 5) {
        pi.push(
          (1 / (4 * absX * absX)) * Math.pow(1 - 1 / (2 * absX), k - 1)
        );
      } else {
        // >=5: 나머지 확률
        let sumPi = 0;
        for (let j = 0; j < 5; j++) sumPi += pi[j];
        pi.push(Math.max(0, 1 - sumPi));
      }
    }

    // 카이제곱
    let chiSq = 0;
    for (let k = 0; k <= 5; k++) {
      const expected = J * pi[k];
      if (expected > 0) {
        chiSq += ((freq[k] - expected) * (freq[k] - expected)) / expected;
      }
    }

    const pValue = igamc(2.5, chiSq / 2); // df = 5
    if (pValue < minPValue) {
      minPValue = pValue;
      testStat = chiSq;
    }
  }

  return {
    testName: 'Random Excursions (Simplified)',
    pValue: minPValue,
    passed: minPValue >= 0.01,
    statistic: testStat,
  };
}

// ============================================================
// NIST 테스트 스위트 실행기
// ============================================================

/**
 * 전체 NIST 테스트 스위트 실행
 * 9개 테스트 결과 + 종합 판정
 */
export function runNistSuite(draws: LottoDrawResult[]): NistSuiteResult {
  const bits = drawsToBitArray(draws);
  const n = bits.length;

  // 최소 비트 수 검증
  if (n < 100) {
    return {
      tests: [],
      passedCount: 0,
      totalTests: 0,
      proportionPassed: 0,
      pValueUniformity: 0,
      verdict: 'suspicious',
      bitLength: n,
    };
  }

  // 모든 테스트 실행
  const tests: NistTestResult[] = [
    frequencyMonobitTest(bits),
    frequencyBlockTest(bits),
    runsTest(bits),
    longestRunTest(bits),
    binaryMatrixRankTest(bits),
    serialTest(bits),
    approximateEntropyTest(bits),
    cumulativeSumsTest(bits),
    randomExcursionsSimplified(bits),
  ];

  const passedCount = tests.filter((t) => t.passed).length;
  const totalTests = tests.length;
  const proportionPassed = passedCount / totalTests;

  // p-value 균일성 검사 (KS 검정)
  const pValues = tests.filter((t) => t.pValue > 0 && t.pValue < 1).map((t) => t.pValue);
  const ksResult = ksTestUniform(pValues);

  // 종합 판정
  let verdict: NistSuiteResult['verdict'];
  if (proportionPassed >= 0.89 && ksResult.pValue >= 0.01) {
    verdict = 'random';
  } else if (proportionPassed >= 0.67) {
    verdict = 'suspicious';
  } else {
    verdict = 'non-random';
  }

  return {
    tests,
    passedCount,
    totalTests,
    proportionPassed,
    pValueUniformity: ksResult.pValue,
    verdict,
    bitLength: n,
  };
}
