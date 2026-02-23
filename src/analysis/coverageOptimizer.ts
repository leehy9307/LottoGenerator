/**
 * Dynamic Pool Sizing — 한계 기대값 분석으로 최적 풀 크기 자동 결정
 *
 * 풀 크기를 14~24 범위에서 탐색하여
 * 한계 EV(Marginal Expected Value)가 양수인 최적 크기를 찾음
 */

// ─── 메모이제이션 파스칼 삼각형 ─────────────────────────────────

const binomialCache = new Map<string, number>();

/**
 * 이항계수 C(n, k) — 파스칼 삼각형 기반 메모이제이션
 */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;

  const key = `${n},${k}`;
  const cached = binomialCache.get(key);
  if (cached !== undefined) return cached;

  const result = binomial(n - 1, k - 1) + binomial(n - 1, k);
  binomialCache.set(key, result);
  return result;
}

// ─── Coverage Statistics ────────────────────────────────────────

export interface CoverageStats {
  poolSize: number;
  match3Prob: number;  // 3개 일치 확률
  match4Prob: number;  // 4개 일치 확률
  match5Prob: number;  // 5개 일치 확률
  match6Prob: number;  // 6개 일치 확률 (잭팟)
  totalEV: number;     // 총 기대값 (원)
}

/**
 * 정확한 이항계수 기반 부분일치 확률 계산
 *
 * P(match=m | pool=P, total=45, draw=6, pick=6) =
 *   C(P,m) * C(45-P, 6-m) / C(45,6)  ← 풀에서 m개 일치
 *   × 풀 내에서 6개 뽑아서 정확히 m개가 당첨번호일 확률
 *
 * 간소화 모델: 풀에서 6개를 뽑을 때 당첨 6개 중 m개가 풀에 있을 확률
 */
export function computeCoverageStats(poolSize: number): CoverageStats {
  const TOTAL = 45;
  const DRAW = 6;
  const PICK = 6;
  const totalCombinations = binomial(TOTAL, DRAW); // C(45,6) = 8,145,060

  // P(당첨 6개 중 정확히 m개가 풀 P개에 포함) = C(P,m) * C(45-P, 6-m) / C(45,6)
  // 이것은 풀에서 "가장 좋은" 6개를 뽑았을 때의 확률이 아니라
  // 당첨번호와 풀의 교집합 크기 분포
  function probWinningInPool(m: number): number {
    return (binomial(poolSize, m) * binomial(TOTAL - poolSize, DRAW - m)) / totalCombinations;
  }

  // 풀에 m개 이상 당첨번호가 있을 때, 풀에서 6개 뽑아 정확히 그 m개를 맞출 조건부 확률
  // P(pick exactly m from pool | pool contains m winning) = C(m,m)*C(P-m,6-m) / C(P,6)
  function probPickGivenPool(m: number): number {
    if (m > PICK || m > poolSize) return 0;
    const poolCombinations = binomial(poolSize, PICK);
    if (poolCombinations === 0) return 0;
    return (binomial(m, m) * binomial(poolSize - m, PICK - m)) / poolCombinations;
  }

  // 결합확률: P(m개 일치) = Σ_{j>=m} P(pool has j winning) × P(pick m from j winning in pool)
  // 단순화: m개 정확 일치 = P(pool has ≥ m winning) × 조건부
  // 더 정확한 계산:
  let match3 = 0, match4 = 0, match5 = 0, match6 = 0;

  for (let j = 0; j <= Math.min(DRAW, poolSize); j++) {
    const pPoolHasJ = probWinningInPool(j);

    // 풀에 j개 당첨번호가 있을 때, 6개 뽑아서 정확히 m개 맞출 확률
    for (let m = Math.max(0, j - (poolSize - PICK)); m <= Math.min(j, PICK); m++) {
      const pPickM = binomial(j, m) * binomial(poolSize - j, PICK - m) / binomial(poolSize, PICK);
      const jointProb = pPoolHasJ * pPickM;

      if (m === 3) match3 += jointProb;
      else if (m === 4) match4 += jointProb;
      else if (m === 5) match5 += jointProb;
      else if (m === 6) match6 += jointProb;
    }
  }

  // 기대값 계산 (등수별 평균 당첨금 기준)
  // 3개 일치: 5등 5,000원
  // 4개 일치: 4등 50,000원
  // 5개 일치: 3등 ~1,500,000원
  // 6개 일치: 1등 ~2,000,000,000원
  const ev3 = match3 * 5_000;
  const ev4 = match4 * 50_000;
  const ev5 = match5 * 1_500_000;
  const ev6 = match6 * 2_000_000_000;
  const totalEV = ev3 + ev4 + ev5 + ev6;

  return {
    poolSize,
    match3Prob: match3,
    match4Prob: match4,
    match5Prob: match5,
    match6Prob: match6,
    totalEV,
  };
}

// ─── Dynamic Pool Sizing ────────────────────────────────────────

/**
 * 한계 EV 분석으로 최적 풀 크기(14~24) 자동 결정
 *
 * 풀 크기를 1 늘릴 때마다 커버리지는 증가하지만,
 * 선택 정확도는 감소 (더 많은 번호에서 6개를 골라야 하므로)
 *
 * 최적 크기 = 한계 EV가 양수이면서 감소세로 전환되는 지점
 *
 * @param rankedNumbers RRF+Interference 퓨전 점수 순위 (내림차순 정렬)
 * @returns 최적 풀 크기 (14~24)
 */
export function findOptimalPoolSize(
  rankedNumbers: Array<{ number: number; score: number }>,
): { optimalSize: number; partialMatchEV: number } {
  const MIN_POOL = 14;
  const MAX_POOL = 24;

  let bestSize = 18; // 기본값
  let bestScore = -Infinity;
  let bestEV = 0;

  // 각 풀 크기에 대한 복합 점수 계산
  const scores: Array<{ size: number; score: number; ev: number }> = [];

  for (let p = MIN_POOL; p <= MAX_POOL; p++) {
    const coverage = computeCoverageStats(p);

    // 풀 내 번호 품질 = 상위 p개 번호의 평균 점수
    const poolQuality = rankedNumbers
      .slice(0, p)
      .reduce((sum, item) => sum + item.score, 0) / p;

    // 선택 정확도 = C(6,6)/C(p,6) — 풀이 작을수록 높음
    const selectionAccuracy = 1 / binomial(p, 6);

    // 복합 점수 = 커버리지 EV × 풀 품질 × 보정
    // 풀 품질이 급격히 떨어지면 풀을 늘리는 것이 불리
    const compositeScore = coverage.totalEV * poolQuality * (1 + selectionAccuracy * 1e6);

    scores.push({ size: p, score: compositeScore, ev: coverage.totalEV });
  }

  // 한계 점수가 양수이면서 최대인 지점 탐색
  for (let i = 0; i < scores.length; i++) {
    if (scores[i].score > bestScore) {
      bestScore = scores[i].score;
      bestSize = scores[i].size;
      bestEV = scores[i].ev;
    }
  }

  // 한계 EV 감소 전환점 탐색 (있으면 우선)
  for (let i = 1; i < scores.length; i++) {
    const marginalEV = scores[i].score - scores[i - 1].score;
    if (marginalEV < 0 && i >= 2) {
      // 감소 전환점 = 이전 크기가 최적
      bestSize = scores[i - 1].size;
      bestEV = scores[i - 1].ev;
      break;
    }
  }

  return { optimalSize: bestSize, partialMatchEV: Math.round(bestEV) };
}
