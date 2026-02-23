import { LottoDrawResult } from '../types/lotto';

/**
 * v4.0 Advanced Models — 5개 독립 모델
 *
 * Model A: Adaptive Frequency (적응형 빈도)
 * Model B: Bayesian Posterior (베이지안 사후확률)
 * Model C: Momentum & Trend (3구간 모멘텀 + 가속도)
 * Model D: Markov Transition (마르코프 전이확률)
 * Model E: Monte Carlo Simulation (시뮬레이션 기반)
 */

// ─── Model A: Adaptive Frequency ─────────────────────────────────

/**
 * 윈도우 {20,30,40,50,60,78}별 카이제곱 계산 → 최적 윈도우의 빈도 비율
 *
 * 핵심: 고정 윈도우 대신 데이터에 가장 유의미한 윈도우를 자동 탐색
 * 카이제곱 값이 가장 높은 윈도우 = 가장 편향이 뚜렷한 구간
 */
export function adaptiveFrequencyScore(draws: LottoDrawResult[]): Map<number, number> {
  const sorted = [...draws].sort((a, b) => a.drawNo - b.drawNo);
  const n = sorted.length;
  const windows = [20, 30, 40, 50, 60, 78].filter(w => w <= n);

  if (windows.length === 0) {
    // 데이터가 20회 미만이면 전체 데이터 사용
    return simpleFrequencyRatio(sorted);
  }

  // 각 윈도우별 카이제곱 계산
  let bestWindow = windows[0];
  let bestChiSquare = -1;

  for (const w of windows) {
    const recentDraws = sorted.slice(n - w);
    const expected = w * 6 / 45;

    // 각 번호의 출현 횟수
    const counts = new Array(46).fill(0);
    for (const draw of recentDraws) {
      for (const num of draw.numbers) {
        counts[num]++;
      }
    }

    // 카이제곱 통계량
    let chiSquare = 0;
    for (let i = 1; i <= 45; i++) {
      chiSquare += Math.pow(counts[i] - expected, 2) / expected;
    }

    if (chiSquare > bestChiSquare) {
      bestChiSquare = chiSquare;
      bestWindow = w;
    }
  }

  // 최적 윈도우에서의 빈도 비율
  const recentDraws = sorted.slice(n - bestWindow);
  const counts = new Array(46).fill(0);
  for (const draw of recentDraws) {
    for (const num of draw.numbers) {
      counts[num]++;
    }
  }

  const scores = new Map<number, number>();
  const totalPicks = bestWindow * 6;
  for (let i = 1; i <= 45; i++) {
    scores.set(i, counts[i] / totalPicks);
  }

  return scores;
}

function simpleFrequencyRatio(draws: LottoDrawResult[]): Map<number, number> {
  const counts = new Array(46).fill(0);
  for (const draw of draws) {
    for (const num of draw.numbers) {
      counts[num]++;
    }
  }
  const total = draws.length * 6;
  const scores = new Map<number, number>();
  for (let i = 1; i <= 45; i++) {
    scores.set(i, total > 0 ? counts[i] / total : 1 / 45);
  }
  return scores;
}

// ─── Model B: Bayesian Posterior ─────────────────────────────────

/**
 * Beta(1 + c_i, 1 + 6N - c_i) 사후분포 평균
 *
 * 사전분포: Beta(1,1) = Uniform (무정보 사전)
 * 관측: c_i = 번호 i의 출현 횟수, 총 6N번 추출
 * 사후분포 평균: (1 + c_i) / (2 + 6N)
 *
 * 장점: 데이터가 적을 때 극단적 추정을 억제 (자연 정규화)
 */
export function bayesianPosteriorScore(draws: LottoDrawResult[]): Map<number, number> {
  const counts = new Array(46).fill(0);
  for (const draw of draws) {
    for (const num of draw.numbers) {
      counts[num]++;
    }
  }

  const N = draws.length;
  const totalPicks = 6 * N; // 총 추출 횟수
  const scores = new Map<number, number>();

  for (let i = 1; i <= 45; i++) {
    // Beta(1 + c_i, 1 + totalPicks - c_i)의 평균
    const alpha = 1 + counts[i];
    const beta = 1 + totalPicks - counts[i];
    const posteriorMean = alpha / (alpha + beta);
    scores.set(i, posteriorMean);
  }

  return scores;
}

// ─── Model C: Momentum & Trend ───────────────────────────────────

/**
 * 3등분 윈도우(old/mid/recent) 속도 + 가속도 결합
 *
 * 데이터를 3구간으로 나눠:
 * - velocity = recent_rate - mid_rate (속도)
 * - acceleration = velocity - (mid_rate - old_rate) (가속도)
 * - 최종 점수 = 0.6 × velocity + 0.4 × acceleration
 *
 * 장점: 단순 모멘텀보다 트렌드 변화의 "변화율"까지 캡처
 */
export function momentumTrendScore(draws: LottoDrawResult[]): Map<number, number> {
  const sorted = [...draws].sort((a, b) => a.drawNo - b.drawNo);
  const n = sorted.length;
  const third = Math.max(1, Math.floor(n / 3));

  const oldDraws = sorted.slice(0, third);
  const midDraws = sorted.slice(third, 2 * third);
  const recentDraws = sorted.slice(2 * third);

  const scores = new Map<number, number>();

  for (let i = 1; i <= 45; i++) {
    const oldRate = countOccurrences(oldDraws, i) / (oldDraws.length || 1);
    const midRate = countOccurrences(midDraws, i) / (midDraws.length || 1);
    const recentRate = countOccurrences(recentDraws, i) / (recentDraws.length || 1);

    const velocity = recentRate - midRate;
    const prevVelocity = midRate - oldRate;
    const acceleration = velocity - prevVelocity;

    // 속도 60% + 가속도 40%
    const combined = 0.6 * velocity + 0.4 * acceleration;
    scores.set(i, combined);
  }

  return scores;
}

function countOccurrences(draws: LottoDrawResult[], num: number): number {
  let count = 0;
  for (const draw of draws) {
    if (draw.numbers.includes(num)) count++;
  }
  return count;
}

// ─── Model D: Markov Transition ──────────────────────────────────

/**
 * 45×45 전이행렬 (Laplace smoothing)
 * 최근 추첨에서 나온 번호들 → 다음에 나올 번호의 조건부 확률
 *
 * 전이행렬 T[i][j]: 번호 i가 나온 다음 추첨에서 번호 j가 나올 확률
 * Laplace smoothing: (count + 1) / (total + 45) 로 0확률 방지
 *
 * 최종 점수: 최근 추첨 번호들로부터의 전이확률 평균
 */
export function markovTransitionScore(draws: LottoDrawResult[]): Map<number, number> {
  const sorted = [...draws].sort((a, b) => a.drawNo - b.drawNo);
  const n = sorted.length;

  // 전이행렬 구축: T[i][j] = 번호 i가 나온 추첨의 다음 추첨에서 j가 나온 횟수
  const transitionCounts: number[][] = Array.from(
    { length: 46 },
    () => new Array(46).fill(0)
  );
  const fromCounts = new Array(46).fill(0);

  for (let d = 0; d < n - 1; d++) {
    const currentNumbers = sorted[d].numbers;
    const nextNumbers = sorted[d + 1].numbers;

    for (const from of currentNumbers) {
      fromCounts[from]++;
      for (const to of nextNumbers) {
        transitionCounts[from][to]++;
      }
    }
  }

  // Laplace smoothing 적용 전이확률
  const transitionProb: number[][] = Array.from(
    { length: 46 },
    () => new Array(46).fill(0)
  );
  for (let i = 1; i <= 45; i++) {
    const total = fromCounts[i];
    for (let j = 1; j <= 45; j++) {
      transitionProb[i][j] = (transitionCounts[i][j] + 1) / (total + 45);
    }
  }

  // 최근 추첨 번호들로부터의 전이확률 가중 평균
  // 최근 3회 추첨, 더 최근일수록 높은 가중치
  const recentWeights = [0.5, 0.3, 0.2]; // 최근, 그 전, 그 전전
  const recentCount = Math.min(3, n);
  const scores = new Map<number, number>();

  for (let j = 1; j <= 45; j++) {
    let totalProb = 0;
    let totalWeight = 0;

    for (let r = 0; r < recentCount; r++) {
      const draw = sorted[n - 1 - r];
      const weight = recentWeights[r] || 0.1;

      for (const from of draw.numbers) {
        totalProb += transitionProb[from][j] * weight;
        totalWeight += weight;
      }
    }

    scores.set(j, totalWeight > 0 ? totalProb / totalWeight : 1 / 45);
  }

  return scores;
}

// ─── Model E: Monte Carlo Simulation ─────────────────────────────

/**
 * 베이지안 확률로 5000회 가중 비복원추출 시뮬레이션
 *
 * 과정:
 * 1. bayesianPosteriorScore()로 각 번호의 사후확률 계산
 * 2. 5000회 반복: 사후확률 기반 가중 비복원추출로 6개 번호 선택
 * 3. 각 번호가 선택된 빈도를 집계
 *
 * 장점: 비선형 상호작용을 시뮬레이션으로 포착
 *       비복원추출이므로 실제 로또 추첨과 동일한 메커니즘
 */
export function monteCarloScore(draws: LottoDrawResult[]): Map<number, number> {
  const posteriors = bayesianPosteriorScore(draws);
  const NUM_SIMULATIONS = 5000;

  // 시뮬레이션용 PRNG (시간 기반 시드)
  let seed = (Date.now() ^ 0xDEADBEEF) >>> 0;
  const rng = (): number => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // 번호별 선택 빈도 카운트
  const selectionCounts = new Array(46).fill(0);

  // 사후확률 배열
  const numbers = Array.from({ length: 45 }, (_, i) => i + 1);
  const probs = numbers.map(n => posteriors.get(n) || 1 / 45);

  for (let sim = 0; sim < NUM_SIMULATIONS; sim++) {
    // 가중 비복원추출 6개
    const available = [...numbers];
    const availableProbs = [...probs];

    for (let pick = 0; pick < 6; pick++) {
      const totalWeight = availableProbs.reduce((sum, p) => sum + p, 0);

      let r = rng() * totalWeight;
      let chosenIdx = 0;
      for (let i = 0; i < availableProbs.length; i++) {
        r -= availableProbs[i];
        if (r <= 0) {
          chosenIdx = i;
          break;
        }
      }

      selectionCounts[available[chosenIdx]]++;
      available.splice(chosenIdx, 1);
      availableProbs.splice(chosenIdx, 1);
    }
  }

  // 정규화하여 점수화
  const scores = new Map<number, number>();
  const totalSelections = NUM_SIMULATIONS * 6;
  for (let i = 1; i <= 45; i++) {
    scores.set(i, selectionCounts[i] / totalSelections);
  }

  return scores;
}
