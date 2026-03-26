/**
 * mathUtils.ts — 공유 수학 유틸리티
 * NIST 테스트, PRNG 탐지기에서 사용하는 기초 수학 함수
 * v11.0
 */

// ============================================================
// 특수 함수 (Special Functions)
// ============================================================

/**
 * 상보 오차 함수 (Complementary Error Function)
 * Abramowitz & Stegun 유리 근사 (7.1.26), 정확도 ~1.5e-7
 */
export function erfc(x: number): number {
  if (x === 0) return 1.0;

  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);

  const t = 1.0 / (1.0 + 0.3275911 * z);
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));

  const result = poly * Math.exp(-z * z);

  return sign === 1 ? result : 2.0 - result;
}

/**
 * 오차 함수
 */
export function erf(x: number): number {
  return 1.0 - erfc(x);
}

/**
 * 정규화 상위 불완전 감마 함수 Q(a, x) = 1 - P(a, x)
 * 카이제곱 p-value 계산에 사용: p = Q(df/2, chi2/2)
 * Continued fraction / series expansion 사용
 */
export function igamc(a: number, x: number): number {
  if (x <= 0) return 1.0;
  if (a <= 0) return 0.0;
  if (x < 1.0 || x < a) return 1.0 - igam(a, x);

  // Legendre continued fraction
  const MAXITER = 200;
  const EPS = 3.0e-14;

  let an: number, del: number;
  let ax = a * Math.log(x) - x - lgamma(a);
  if (ax < -709.78) return 0.0;
  ax = Math.exp(ax);

  let b = x + 1.0 - a;
  let c = 1.0 / 1.0e-30;
  let d = 1.0 / b;
  let h = d;

  for (let i = 1; i <= MAXITER; i++) {
    an = -i * (i - a);
    b += 2.0;
    d = an * d + b;
    if (Math.abs(d) < 1.0e-30) d = 1.0e-30;
    c = b + an / c;
    if (Math.abs(c) < 1.0e-30) c = 1.0e-30;
    d = 1.0 / d;
    del = d * c;
    h *= del;
    if (Math.abs(del - 1.0) < EPS) break;
  }

  return h * ax;
}

/**
 * 정규화 하위 불완전 감마 함수 P(a, x) = γ(a, x) / Γ(a)
 * Series expansion
 */
export function igam(a: number, x: number): number {
  if (x <= 0) return 0.0;
  if (a <= 0) return 1.0;

  const MAXITER = 200;
  const EPS = 3.0e-14;

  let ax = a * Math.log(x) - x - lgamma(a);
  if (ax < -709.78) return 0.0;
  ax = Math.exp(ax);

  let sum = 1.0 / a;
  let term = 1.0 / a;

  for (let n = 1; n <= MAXITER; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * EPS) break;
  }

  return sum * ax;
}

/**
 * 로그 감마 함수 ln(Γ(x))
 * Lanczos 근사
 */
export function lgamma(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x - 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;

  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }

  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// ============================================================
// 정수론 (Number Theory)
// ============================================================

/**
 * 최대공약수 (유클리드 알고리즘)
 */
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * BigInt 최대공약수
 */
export function gcdBig(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * 모듈러 거듭제곱 (BigInt 기반)
 * base^exp mod m
 */
export function modPow(base: number, exp: number, mod: number): number {
  let b = BigInt(base) % BigInt(mod);
  let e = BigInt(exp);
  const m = BigInt(mod);
  let result = 1n;

  if (m === 0n) return 0;

  b = ((b % m) + m) % m;

  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % m;
    }
    e >>= 1n;
    b = (b * b) % m;
  }

  return Number(result);
}

/**
 * 확장 유클리드 알고리즘 (BigInt)
 * ax + by = gcd(a, b) 의 (gcd, x, y) 반환
 */
export function extGcdBig(
  a: bigint,
  b: bigint
): { gcd: bigint; x: bigint; y: bigint } {
  if (b === 0n) return { gcd: a, x: 1n, y: 0n };
  const { gcd: g, x: x1, y: y1 } = extGcdBig(b, a % b);
  return { gcd: g, x: y1, y: x1 - (a / b) * y1 };
}

/**
 * 모듈러 역원 (BigInt)
 * a^(-1) mod m, 존재하지 않으면 null
 */
export function modInverseBig(a: bigint, m: bigint): bigint | null {
  const { gcd: g, x } = extGcdBig(a, m);
  if (g !== 1n) return null;
  return ((x % m) + m) % m;
}

// ============================================================
// GF(2) 선형대수 (Binary Linear Algebra)
// ============================================================

/**
 * GF(2) 위 가우스 소거법 — 이진 행렬의 랭크 계산
 * 각 행은 Uint8Array (0 또는 1)
 * NIST Binary Matrix Rank Test에 사용
 */
export function gaussianEliminationGF2(matrix: number[][]): number {
  const rows = matrix.length;
  if (rows === 0) return 0;
  const cols = matrix[0].length;

  // 복사
  const m = matrix.map((row) => [...row]);

  let rank = 0;
  for (let col = 0; col < cols && rank < rows; col++) {
    // 피벗 찾기
    let pivotRow = -1;
    for (let row = rank; row < rows; row++) {
      if (m[row][col] === 1) {
        pivotRow = row;
        break;
      }
    }
    if (pivotRow === -1) continue;

    // 행 교환
    if (pivotRow !== rank) {
      [m[rank], m[pivotRow]] = [m[pivotRow], m[rank]];
    }

    // 소거
    for (let row = 0; row < rows; row++) {
      if (row !== rank && m[row][col] === 1) {
        for (let j = col; j < cols; j++) {
          m[row][j] ^= m[rank][j];
        }
      }
    }

    rank++;
  }

  return rank;
}

// ============================================================
// Berlekamp-Massey 알고리즘 (LFSR 탐지)
// ============================================================

/**
 * Berlekamp-Massey 알고리즘
 * 이진 시퀀스의 최소 선형 복잡도(LFSR 길이)와 연결 다항식을 반환
 *
 * @param bits - 0/1 배열
 * @returns { complexity: 선형 복잡도, polynomial: 연결 다항식 계수 }
 */
export function berlekampMassey(bits: number[]): {
  complexity: number;
  polynomial: number[];
} {
  const n = bits.length;
  let c = new Array(n + 1).fill(0); // 현재 연결 다항식
  let b = new Array(n + 1).fill(0); // 이전 연결 다항식
  let t: number[];

  c[0] = 1;
  b[0] = 1;

  let L = 0; // 현재 LFSR 길이
  let m = -1; // 마지막으로 L이 갱신된 위치

  for (let N = 0; N < n; N++) {
    // discrepancy 계산
    let d = bits[N];
    for (let i = 1; i <= L; i++) {
      d ^= c[i] & bits[N - i];
    }

    if (d === 1) {
      t = [...c]; // 현재 c 백업

      const shift = N - m;
      for (let i = shift; i < n + 1; i++) {
        c[i] ^= b[i - shift];
      }

      if (2 * L <= N) {
        L = N + 1 - L;
        m = N;
        b = t;
      }
    }
  }

  return {
    complexity: L,
    polynomial: c.slice(0, L + 1),
  };
}

// ============================================================
// 격자 축소 (Lattice Reduction)
// ============================================================

/**
 * 2D 가우스/라그랑주 격자 축소
 * 두 기저 벡터를 최단 기저로 변환
 * LCG 탐지에 사용
 */
export function latticeReduce2D(
  v1: [number, number],
  v2: [number, number]
): { reduced: [[number, number], [number, number]]; iterations: number } {
  let a: [number, number] = [...v1];
  let b: [number, number] = [...v2];
  let iter = 0;
  const MAX_ITER = 1000;

  // |a|² ≥ |b|² 보장
  const norm2 = (v: [number, number]) => v[0] * v[0] + v[1] * v[1];

  if (norm2(a) < norm2(b)) {
    [a, b] = [b, a];
  }

  while (iter < MAX_ITER) {
    // 가장 가까운 정수 mu = round(<a, b> / <b, b>)
    const dot = a[0] * b[0] + a[1] * b[1];
    const nb = norm2(b);
    if (nb === 0) break;

    const mu = Math.round(dot / nb);
    if (mu === 0) break;

    // a = a - mu * b
    a[0] -= mu * b[0];
    a[1] -= mu * b[1];

    // |a| < |b| 이면 교환
    if (norm2(a) < norm2(b)) {
      [a, b] = [b, a];
    }

    iter++;
  }

  // b가 더 짧은 벡터
  return { reduced: [b, a], iterations: iter };
}

/**
 * 3D 격자 축소 (LLL 간소화 버전)
 * delta = 0.75 (Lovász 조건)
 */
export function latticeReduce3D(
  basis: [number, number, number][]
): [number, number, number][] {
  const n = basis.length;
  if (n < 2) return basis.map((v) => [...v] as [number, number, number]);

  const b = basis.map((v) => [...v] as [number, number, number]);
  const delta = 0.75;
  const MAX_ITER = 500;

  const dot3 = (a: number[], c: number[]) =>
    a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
  const norm3 = (a: number[]) => dot3(a, a);

  let k = 1;
  let iter = 0;

  while (k < n && iter < MAX_ITER) {
    iter++;

    // 크기 축소 (size-reduce b[k] against b[j] for j < k)
    for (let j = k - 1; j >= 0; j--) {
      const nj = norm3(b[j]);
      if (nj === 0) continue;
      const mu = Math.round(dot3(b[k], b[j]) / nj);
      if (mu !== 0) {
        b[k][0] -= mu * b[j][0];
        b[k][1] -= mu * b[j][1];
        b[k][2] -= mu * b[j][2];
      }
    }

    // Lovász 조건 검사
    if (k > 0 && norm3(b[k]) < (delta - 0.25) * norm3(b[k - 1])) {
      // 교환
      [b[k], b[k - 1]] = [b[k - 1], b[k]];
      k = Math.max(k - 1, 1);
    } else {
      k++;
    }
  }

  return b;
}

// ============================================================
// 조합론 (Combinatorics)
// ============================================================

/**
 * 이항 계수 C(n, k)
 */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n - k) k = n - k;

  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

/**
 * 조합의 사전순 랭크 (0-indexed)
 * combo: 1-based sorted array (오름차순), n: 전체 범위, k: 선택 수
 *
 * 랭크 = C(n,k) - 1 - Σ C(n - combo[i], k - i) (colex order 변환)
 * 또는 직접 lex order 계산
 *
 * 예: combo=[1,2,3,4,5,6], n=45, k=6 → rank=0
 */
export function combinatorialRank(
  combo: number[],
  n: number,
  k: number
): number {
  // Lex order rank: Σ_{i=0}^{k-1} [C(n, k) - C(n - combo[i] + 1, k - i)]
  // 간단한 방법: 직접 계산
  let rank = 0;
  let prev = 0; // 이전 번호 (0-based로 변환할 때)

  for (let i = 0; i < k; i++) {
    const ci = combo[i] - 1; // 0-based
    for (let j = prev; j < ci; j++) {
      rank += binomial(n - 1 - j, k - 1 - i);
    }
    prev = ci + 1;
  }

  return rank;
}

/**
 * 랭크 → 조합 역변환 (1-based)
 */
export function combinatorialUnrank(
  rank: number,
  n: number,
  k: number
): number[] {
  const result: number[] = [];
  let r = rank;
  let start = 0;

  for (let i = 0; i < k; i++) {
    for (let j = start; j < n; j++) {
      const count = binomial(n - 1 - j, k - 1 - i);
      if (r < count) {
        result.push(j + 1); // 1-based
        start = j + 1;
        break;
      }
      r -= count;
    }
  }

  return result;
}

// ============================================================
// 통계 유틸리티
// ============================================================

/**
 * 표준 정규분포 CDF Φ(z)
 * Abramowitz & Stegun 근사
 */
export function normalCDF(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

/**
 * Kolmogorov-Smirnov 검정 통계량 (1-sample, 균일분포 U(0,1) 대비)
 * p-values 배열이 U(0,1) 균일분포를 따르는지 검정
 */
export function ksTestUniform(values: number[]): {
  statistic: number;
  pValue: number;
} {
  const n = values.length;
  if (n === 0) return { statistic: 0, pValue: 1 };

  const sorted = [...values].sort((a, b) => a - b);
  let dMax = 0;

  for (let i = 0; i < n; i++) {
    const dPlus = (i + 1) / n - sorted[i];
    const dMinus = sorted[i] - i / n;
    dMax = Math.max(dMax, dPlus, dMinus);
  }

  // Kolmogorov 분포 근사 (n > 40일 때 유효)
  const sqrtN = Math.sqrt(n);
  const lambda = (sqrtN + 0.12 + 0.11 / sqrtN) * dMax;

  // Kolmogorov CDF: P(D <= d) ≈ 1 - 2 * Σ (-1)^(j-1) exp(-2j²λ²)
  let pValue = 0;
  for (let j = 1; j <= 100; j++) {
    const term =
      2 * Math.pow(-1, j - 1) * Math.exp(-2 * j * j * lambda * lambda);
    pValue += term;
    if (Math.abs(term) < 1e-10) break;
  }

  pValue = Math.max(0, Math.min(1, 1 - pValue));

  return { statistic: dMax, pValue };
}
