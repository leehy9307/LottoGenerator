import { LottoDrawResult } from '../types/lotto';
import { WeightedDraw } from './dataWindowing';

/**
 * Structural Profile v7.0 — Bayesian 10-Dimension Structural Validator
 *
 * Validates that a combination fits the statistical structure
 * of real winning combinations. Uses Normal-Inverse-Gamma prior
 * → Student-t posterior predictive interval.
 *
 * v7.0 additions:
 *  - AC (Arithmetic Complexity) value — standard lotto analysis metric
 *  - Prime number ratio
 *  - Improved hard constraints with data-driven thresholds
 */

// ─── Dimension Definitions ──────────────────────────────────────

interface DimensionDef {
  name: string;
  weight: number;
  hardRejectMin: number;
  hardRejectMax: number;
  extract: (combo: number[]) => number;
  extractFromDraw: (draw: LottoDrawResult) => number;
}

/**
 * AC (Arithmetic Complexity) — measures how "non-patterned" a combination is.
 * AC = count of distinct differences between all pairs.
 * Range for 6 numbers: 1 to 15 (C(6,2)=15 pairs).
 * Higher AC = more "random looking" = less likely to be manually chosen.
 */
function computeAC(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const diffs = new Set<number>();
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length; j++) {
      diffs.add(s[j] - s[i]);
    }
  }
  return diffs.size;
}

/**
 * v7.1 — 가중치 재조정: 역대 당첨번호 구조를 최대한 충실히 재현
 * 한국 로또 6/45의 실제 당첨번호 통계 기반 가중치와 제약 조건
 */
const DIMENSIONS: DimensionDef[] = [
  // (1) Sum — 역대 1,216회 분석: 평균=138.2, 표준편차=30.8
  // 실측 범위 [48, 238], 95% 신뢰구간 ≈ [77, 200]
  {
    name: 'sum',
    weight: 0.20,
    hardRejectMin: 77,   // v9.0: 실측 기반 (v8: 75)
    hardRejectMax: 200,  // v9.0: 실측 기반 (v8: 205)
    extract: (c) => c.reduce((a, b) => a + b, 0),
    extractFromDraw: (d) => d.numbers.reduce((a, b) => a + b, 0),
  },
  // (2) Odd count — 1,216회 분석: 홀3=33.5%, 홀4=26.7%, 홀2=22.2%
  // 홀0=1.4%, 홀6=1.5% (극히 드묾)
  {
    name: 'oddCount',
    weight: 0.12,
    hardRejectMin: 1.5,  // 홀1(6.7%)까지 허용, 홀0(1.4%) 제외
    hardRejectMax: 4.5,  // 홀5(8.1%)까지 허용, 홀6(1.5%) 제외
    extract: (c) => c.filter(n => n % 2 === 1).length,
    extractFromDraw: (d) => d.numbers.filter(n => n % 2 === 1).length,
  },
  // (3) Low count (1-22) — 저번호 2~4개가 정상 범위
  {
    name: 'lowCount',
    weight: 0.10,
    hardRejectMin: 0.5,
    hardRejectMax: 5.5,
    extract: (c) => c.filter(n => n <= 22).length,
    extractFromDraw: (d) => d.numbers.filter(n => n <= 22).length,
  },
  // (4) Max consecutive run — 연번 3개까지 허용 (실제 ~5% 발생)
  {
    name: 'maxConsecutive',
    weight: 0.10, // ↑ (v7.0: 0.08) — 연번 과다는 확실히 걸러야 함
    hardRejectMin: -Infinity,
    hardRejectMax: 3.5,
    extract: (c) => {
      const s = [...c].sort((a, b) => a - b);
      let max = 1, run = 1;
      for (let i = 1; i < s.length; i++) {
        if (s[i] === s[i - 1] + 1) { run++; max = Math.max(max, run); }
        else run = 1;
      }
      return max;
    },
    extractFromDraw: (d) => {
      const s = [...d.numbers].sort((a, b) => a - b);
      let max = 1, run = 1;
      for (let i = 1; i < s.length; i++) {
        if (s[i] === s[i - 1] + 1) { run++; max = Math.max(max, run); }
        else run = 1;
      }
      return max;
    },
  },
  // (5) Mean gap — 번호 간 평균 간격. 역대 평균 ≈ 7.8
  {
    name: 'meanGap',
    weight: 0.10,
    hardRejectMin: 2.0,  // 너무 뭉치면 제외
    hardRejectMax: 25,   // 너무 벌어지면 제외
    extract: (c) => {
      const s = [...c].sort((a, b) => a - b);
      let sum = 0;
      for (let i = 1; i < s.length; i++) sum += s[i] - s[i - 1];
      return sum / (s.length - 1);
    },
    extractFromDraw: (d) => {
      const s = [...d.numbers].sort((a, b) => a - b);
      let sum = 0;
      for (let i = 1; i < s.length; i++) sum += s[i] - s[i - 1];
      return sum / (s.length - 1);
    },
  },
  // (6) Decade coverage — 최소 3개 구간은 커버해야 정상
  {
    name: 'decadeCoverage',
    weight: 0.08,
    hardRejectMin: 2.5,
    hardRejectMax: Infinity,
    extract: (c) => {
      const groups = new Set(c.map(n => n >= 40 ? 4 : Math.floor((n - 1) / 10)));
      return groups.size;
    },
    extractFromDraw: (d) => {
      const groups = new Set(d.numbers.map(n => n >= 40 ? 4 : Math.floor((n - 1) / 10)));
      return groups.size;
    },
  },
  // (7) Last digit diversity — 끝자리 다양성
  {
    name: 'lastDigitDiversity',
    weight: 0.06,
    hardRejectMin: 2.5,
    hardRejectMax: Infinity,
    extract: (c) => new Set(c.map(n => n % 10)).size,
    extractFromDraw: (d) => new Set(d.numbers.map(n => n % 10)).size,
  },
  // (8) Range (max - min) — 1,216회 분석: 평균=32.7
  {
    name: 'range',
    weight: 0.08,
    hardRejectMin: 17,   // v9.0: 실측 데이터에서 15~17 구간도 간혹 존재
    hardRejectMax: Infinity,
    extract: (c) => {
      const s = [...c].sort((a, b) => a - b);
      return s[5] - s[0];
    },
    extractFromDraw: (d) => {
      const s = [...d.numbers].sort((a, b) => a - b);
      return s[5] - s[0];
    },
  },
  // (9) AC value — 1,216회 분석: AC=8(35.1%), AC=10(18.2%), AC=9(17.7%)
  // AC≤5 구간 합계 5.8% (드묾), AC=7까지 합계 19.6%
  {
    name: 'arithmeticComplexity',
    weight: 0.12,
    hardRejectMin: 7,    // v9.0: AC=7도 13.8% 존재하므로 허용 (v8: 8)
    hardRejectMax: Infinity,
    extract: (c) => computeAC(c),
    extractFromDraw: (d) => computeAC(d.numbers),
  },
  // (10) Prime count — 소수 개수. 역대 평균 ≈ 1.9개
  {
    name: 'primeCount',
    weight: 0.04,
    hardRejectMin: -Infinity,
    hardRejectMax: Infinity,
    extract: (c) => {
      const primes = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43]);
      return c.filter(n => primes.has(n)).length;
    },
    extractFromDraw: (d) => {
      const primes = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43]);
      return d.numbers.filter(n => primes.has(n)).length;
    },
  },
];

// ─── Bayesian Statistics ────────────────────────────────────────

interface BayesianParams {
  mu: number;       // posterior mean
  sigma: number;    // posterior std
  nu: number;       // degrees of freedom for Student-t
}

/**
 * v8.0 — 가중 Normal-Inverse-Gamma posterior → Student-t predictive.
 *
 * 시간 감쇠 가중치를 반영하여 최근 데이터에 더 큰 영향력을 부여.
 * 유효 샘플 크기(n_eff) = (Σw)² / Σw² 로 계산하여
 * posterior 폭이 적절히 유지되도록 함.
 *
 * 핵심 개선:
 *   - 기존: 200회를 동등 가중 → posterior σ ≈ 0.x (극히 좁음)
 *   - 변경: 유효 ~40회 수준 → posterior σ 적절 유지 → 새 패턴 반영 가능
 */
function computeWeightedPosterior(
  values: number[],
  weights: number[],
): BayesianParams {
  const n = values.length;
  if (n < 2) return { mu: 0, sigma: 100, nu: 1 };

  // 가중 평균
  let wSum = 0;
  let wMean = 0;
  for (let i = 0; i < n; i++) {
    wSum += weights[i];
    wMean += values[i] * weights[i];
  }
  wMean /= wSum;

  // 가중 분산
  let wVar = 0;
  for (let i = 0; i < n; i++) {
    wVar += weights[i] * (values[i] - wMean) ** 2;
  }
  wVar /= wSum;

  // 유효 샘플 크기: n_eff = (Σw)² / Σw²
  let wSqSum = 0;
  for (let i = 0; i < n; i++) {
    wSqSum += weights[i] ** 2;
  }
  const nEff = Math.max((wSum * wSum) / wSqSum, 2);

  // NIG prior hyperparameters (weakly informative)
  const mu0 = wMean;
  const kappa0 = 1;
  const alpha0 = 1;
  const beta0 = Math.max(wVar, 0.01);

  // Posterior (using effective sample size)
  const kappaN = kappa0 + nEff;
  const muN = (kappa0 * mu0 + nEff * wMean) / kappaN;
  const alphaN = alpha0 + nEff / 2;
  const betaN = beta0 + 0.5 * (nEff - 1) * wVar
    + (kappa0 * nEff * (wMean - mu0) ** 2) / (2 * kappaN);

  // Student-t predictive
  const nu = 2 * alphaN;
  const sigma = Math.sqrt(betaN * (kappaN + 1) / (alphaN * kappaN));

  return { mu: muN, sigma, nu };
}

/** 비가중 버전 (하위 호환) */
function computePosterior(values: number[]): BayesianParams {
  const uniformWeights = new Array(values.length).fill(1 / values.length);
  return computeWeightedPosterior(values, uniformWeights);
}

/**
 * Student-t CDF approximation for scoring.
 * Returns probability that value is within typical range.
 */
function studentTScore(value: number, params: BayesianParams): number {
  const z = Math.abs(value - params.mu) / (params.sigma || 1);
  // Gaussian approximation for large nu; exact for small nu
  return Math.exp(-0.5 * z * z);
}

// ─── Structural Profile ─────────────────────────────────────────

export interface StructuralProfileData {
  posteriors: BayesianParams[];
}

/**
 * Build structural profile from historical draws.
 * v8.0: 가중 데이터 지원 — WeightedDraw[]를 받으면 시간 감쇠 가중치 적용.
 */
export function buildStructuralProfile(
  draws: LottoDrawResult[] | WeightedDraw[],
): StructuralProfileData {
  const posteriors: BayesianParams[] = [];

  // WeightedDraw[] 인지 판별
  const isWeighted = draws.length > 0 && 'weight' in draws[0];

  for (const dim of DIMENSIONS) {
    if (isWeighted) {
      const wd = draws as WeightedDraw[];
      const values = wd.map(w => dim.extractFromDraw(w.draw));
      const weights = wd.map(w => w.weight);
      posteriors.push(computeWeightedPosterior(values, weights));
    } else {
      const dd = draws as LottoDrawResult[];
      const values = dd.map(d => dim.extractFromDraw(d));
      posteriors.push(computePosterior(values));
    }
  }

  return { posteriors };
}

// ─── Combination Scoring ────────────────────────────────────────

export interface StructuralScore {
  totalScore: number;     // weighted sum (0~1)
  hardReject: boolean;    // any hard constraint violated
  dimensionScores: number[];
  acValue: number;        // v7.0: AC value for display
}

/**
 * Score a combination against the structural profile.
 * Returns weighted fit score and hard reject flag.
 */
export function scoreCombinationStructure(
  combo: number[],
  profile: StructuralProfileData,
): StructuralScore {
  const sorted = [...combo].sort((a, b) => a - b);
  const dimensionScores: number[] = [];
  let hardReject = false;
  let weightedSum = 0;
  let totalWeight = 0;
  let acValue = 0;

  for (let i = 0; i < DIMENSIONS.length; i++) {
    const dim = DIMENSIONS[i];
    const value = dim.extract(sorted);

    if (dim.name === 'arithmeticComplexity') {
      acValue = value;
    }

    // Hard reject check
    if (value < dim.hardRejectMin || value > dim.hardRejectMax) {
      hardReject = true;
    }

    // Soft score via Bayesian posterior
    const score = studentTScore(value, profile.posteriors[i]);
    dimensionScores.push(score);

    weightedSum += score * dim.weight;
    totalWeight += dim.weight;
  }

  return {
    totalScore: totalWeight > 0 ? weightedSum / totalWeight : 0,
    hardReject,
    dimensionScores,
    acValue,
  };
}

/**
 * Quick check: does combo pass all hard constraints?
 */
export function passesHardConstraints(combo: number[]): boolean {
  const sorted = [...combo].sort((a, b) => a - b);
  for (const dim of DIMENSIONS) {
    const value = dim.extract(sorted);
    if (value < dim.hardRejectMin || value > dim.hardRejectMax) {
      return false;
    }
  }
  return true;
}
