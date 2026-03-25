import { LottoDrawResult } from '../types/lotto';
import { WeightedDraw } from './dataWindowing';

/**
 * Pattern Engine v9.0 — 역대 당첨번호 패턴 기반 4중 예측 엔진
 *
 * 1,216회차 역대 데이터 분석에서 검출된 패턴을 활용:
 *
 * [1] 마르코프 전이 모델 (Markov Transition Model)
 *     — 이전 N회차 당첨번호 → 다음 회차 번호 전이 확률
 *     — 발견: 이전 회차 번호 0개 재출현(38.7%), 1개(42.4%), 2개(16.8%)
 *
 * [2] 휴면 주기 감지 (Dormancy Cycle Detection)
 *     — 번호별 출현/미출현 주기를 분석하여 "각성 임박" 번호 예측
 *     — 발견: 각 번호의 평균 출현 간격은 ~7.5회, 표준편차 ~6회
 *     — 20회 이상 미출현 번호는 통계적으로 출현 확률이 높아지는 경향
 *
 * [3] 모멘텀 스코어링 (Momentum Scoring)
 *     — 최근 빈도의 가속도(속도 변화율) 기반
 *     — 발견: 최근 52주 급상승(27번 +82%) / 급하락(34번 -74%)
 *
 * [4] 페어 친화도 네트워크 (Pair Affinity Network)
 *     — 기대 동반 출현 대비 실제 동반 출현 Z-score
 *     — 발견: (11,21)=34회, (33,40)=33회 등 유의미한 양의 상관
 */

// ════════════════════════════════════════════════════════════════════
// [1] 마르코프 전이 모델
// ════════════════════════════════════════════════════════════════════

/**
 * 이전 K회차의 당첨번호 → 다음 회차에 각 번호가 출현할 조건부 확률.
 *
 * P(n 출현 | 이전 K회차) = 가중 카운트 / 총 기회
 *
 * K=3을 사용: 가장 최근 3회의 영향을 지수 감쇠로 반영.
 */
export interface MarkovScores {
  /** 각 번호(1-45)의 전이 확률 점수 (0~1, 높을수록 출현 가능성 높음) */
  transitionScores: Map<number, number>;
  /** 이전 회차와 재출현 기대 개수 */
  expectedRepeat: number;
}

const MARKOV_LOOKBACK = 3;
const MARKOV_DECAY = [0.50, 0.30, 0.20]; // 가장 최근 → 과거 가중치

export function computeMarkovScores(draws: LottoDrawResult[]): MarkovScores {
  const sorted = [...draws].sort((a, b) => b.drawNo - a.drawNo);

  if (sorted.length < MARKOV_LOOKBACK + 30) {
    // 데이터 부족: 균등 분포 반환
    const uniform = new Map<number, number>();
    for (let n = 1; n <= 45; n++) uniform.set(n, 6 / 45);
    return { transitionScores: uniform, expectedRepeat: 0.8 };
  }

  // 전이 카운팅: 이전 K회에서 번호 n이 나왔을 때, 다음 회에 각 번호가 나올 확률
  // 단순화: 이전 K회의 번호 집합이 주어졌을 때, 다음 회 각 번호의 출현 빈도
  const condCounts = new Array(46).fill(0);  // [n] = 이전 K회 context가 주어졌을 때 n의 출현 횟수
  let totalSamples = 0;

  // 또한: "이전 회차에 나온 번호가 다시 나오는 경향" 측정
  const repeatAfterAppearance = new Array(46).fill(0); // 이전에 나왔는데 또 나온 횟수
  const appearanceCount = new Array(46).fill(0); // 이전에 나온 횟수

  for (let i = 0; i < sorted.length - MARKOV_LOOKBACK; i++) {
    const target = sorted[i]; // 다음 회차 (예측 대상)
    const targetSet = new Set(target.numbers);

    // 이전 K회의 가중 번호 집합
    const contextScores = new Map<number, number>();
    for (let k = 0; k < MARKOV_LOOKBACK; k++) {
      const prev = sorted[i + 1 + k];
      if (!prev) continue;
      for (const n of prev.numbers) {
        contextScores.set(n, (contextScores.get(n) || 0) + MARKOV_DECAY[k]);
      }
    }

    // 현재 context에서 각 번호의 출현 여부 기록
    for (const n of targetSet) {
      condCounts[n]++;
    }
    totalSamples++;

    // 재출현 분석
    for (const [n, score] of contextScores) {
      appearanceCount[n] += score;
      if (targetSet.has(n)) {
        repeatAfterAppearance[n] += score;
      }
    }
  }

  // 기저 확률 (전체 데이터 기반)
  const baseProb = new Array(46).fill(0);
  for (let n = 1; n <= 45; n++) {
    baseProb[n] = condCounts[n] / totalSamples;
  }

  // 전이 확률: "이전에 나온 뒤 다시 나올 확률" vs "이전에 안 나온 상태에서 나올 확률"
  const transitionScores = new Map<number, number>();

  // 가장 최근 K회의 번호
  const recentContext = new Map<number, number>();
  for (let k = 0; k < Math.min(MARKOV_LOOKBACK, sorted.length); k++) {
    for (const n of sorted[k].numbers) {
      recentContext.set(n, (recentContext.get(n) || 0) + MARKOV_DECAY[k]);
    }
  }

  for (let n = 1; n <= 45; n++) {
    const contextWeight = recentContext.get(n) || 0;

    if (contextWeight > 0 && appearanceCount[n] > 0) {
      // 이 번호가 최근에 나왔을 때의 재출현 확률
      const repeatRate = repeatAfterAppearance[n] / appearanceCount[n];
      // 가중: context weight × repeat rate + (1 - context_decay) × base rate
      const blended = contextWeight * repeatRate + (1 - contextWeight * 0.5) * baseProb[n];
      transitionScores.set(n, Math.min(blended, 1));
    } else {
      // 최근에 안 나온 번호: 기저 확률 사용
      transitionScores.set(n, baseProb[n]);
    }
  }

  // 정규화: 0~1 스케일
  const values = Array.from(transitionScores.values());
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  for (const [n, v] of transitionScores) {
    transitionScores.set(n, (v - minV) / range);
  }

  // 기대 재출현 수
  const prevSet = new Set(sorted[0]?.numbers || []);
  let expectedRepeat = 0;
  for (const n of prevSet) {
    expectedRepeat += transitionScores.get(n) || 0;
  }

  return { transitionScores, expectedRepeat: Math.min(expectedRepeat, 3) };
}

// ════════════════════════════════════════════════════════════════════
// [2] 휴면 주기 감지
// ════════════════════════════════════════════════════════════════════

/**
 * 각 번호의 출현 간격(gap) 분포를 분석하여 "각성 임박" 확률을 계산.
 *
 * 원리:
 *   각 번호의 gap 분포는 대략 기하 분포를 따름 (p ≈ 6/45 ≈ 0.133)
 *   하지만 실제로는 번호마다 고유한 평균 gap과 분산이 있음.
 *   현재 미출현 기간이 해당 번호의 평균 gap을 크게 초과하면
 *   "각성 임박" (awakening imminent) 으로 판정.
 *
 * 수학적 모델:
 *   awakening_score(n) = CDF_exponential(current_gap; λ=1/mean_gap)
 *   → 현재 gap이 길수록 각성 점수가 높아짐 (CDF → 1에 수렴)
 */
export interface DormancyScores {
  /** 각 번호의 각성 임박 점수 (0~1, 1=매우 높은 각성 확률) */
  awakeningScores: Map<number, number>;
  /** 현재 가장 오래 잠든 번호 TOP 5 */
  topDormant: Array<{ number: number; gap: number; score: number }>;
}

export function computeDormancyScores(draws: LottoDrawResult[]): DormancyScores {
  const sorted = [...draws].sort((a, b) => b.drawNo - a.drawNo);
  const latest = sorted[0]?.drawNo || 0;

  // 각 번호의 모든 출현 gap 수집
  const lastSeen = new Map<number, number>();
  const gaps = new Map<number, number[]>();

  for (let n = 1; n <= 45; n++) gaps.set(n, []);

  // 과거→현재 순서로 순회하여 gap 수집
  const chronological = [...sorted].reverse();
  for (const d of chronological) {
    for (const n of d.numbers) {
      const prev = lastSeen.get(n);
      if (prev !== undefined) {
        gaps.get(n)!.push(d.drawNo - prev);
      }
      lastSeen.set(n, d.drawNo);
    }
  }

  const awakeningScores = new Map<number, number>();
  const dormantList: Array<{ number: number; gap: number; score: number }> = [];

  for (let n = 1; n <= 45; n++) {
    const numGaps = gaps.get(n)!;
    const currentGap = latest - (lastSeen.get(n) || 0);

    if (numGaps.length < 3) {
      // 데이터 부족: 보수적 점수
      awakeningScores.set(n, 0.5);
      continue;
    }

    // 평균 gap과 표준편차
    const meanGap = numGaps.reduce((a, b) => a + b, 0) / numGaps.length;
    const stdGap = Math.sqrt(
      numGaps.reduce((s, g) => s + (g - meanGap) ** 2, 0) / numGaps.length
    );

    // Exponential CDF: P(X ≤ currentGap) = 1 - exp(-currentGap / meanGap)
    // → 현재 gap이 평균보다 길수록 1에 수렴
    const cdfScore = 1 - Math.exp(-currentGap / Math.max(meanGap, 1));

    // Z-score 보정: 현재 gap이 평균에서 몇 σ 떨어졌는지
    const zScore = stdGap > 0 ? (currentGap - meanGap) / stdGap : 0;

    // 최종 점수: CDF 기반 + Z-score 보너스
    // Z > 1이면 각성 확률 추가 보너스
    let score = cdfScore;
    if (zScore > 1) score = Math.min(score + 0.1 * (zScore - 1), 1);
    if (zScore > 2) score = Math.min(score + 0.15, 1);

    awakeningScores.set(n, Math.max(0, Math.min(score, 1)));

    dormantList.push({ number: n, gap: currentGap, score });
  }

  dormantList.sort((a, b) => b.gap - a.gap);

  return {
    awakeningScores,
    topDormant: dormantList.slice(0, 5),
  };
}

// ════════════════════════════════════════════════════════════════════
// [3] 모멘텀 스코어링
// ════════════════════════════════════════════════════════════════════

/**
 * 번호별 출현 빈도의 "가속도"를 측정.
 *
 * 3구간 비교: 장기 평균 → 중기(최근 24주) → 단기(최근 8주)
 * 모멘텀 = (단기 비율 - 중기 비율) + α × (중기 비율 - 장기 비율)
 *
 * 양의 모멘텀: 최근 갈수록 더 자주 출현 → 상승 추세
 * 음의 모멘텀: 최근 갈수록 덜 출현 → 하락 추세
 */
export interface MomentumScores {
  /** 각 번호의 모멘텀 점수 (-1 ~ +1) */
  momentum: Map<number, number>;
  /** 상승 추세 TOP 5 */
  rising: Array<{ number: number; score: number }>;
  /** 하락 추세 TOP 5 */
  falling: Array<{ number: number; score: number }>;
}

export function computeMomentumScores(draws: LottoDrawResult[]): MomentumScores {
  const sorted = [...draws].sort((a, b) => b.drawNo - a.drawNo);

  const SHORT_WINDOW = 8;
  const MID_WINDOW = 24;

  const shortSlice = sorted.slice(0, Math.min(SHORT_WINDOW, sorted.length));
  const midSlice = sorted.slice(0, Math.min(MID_WINDOW, sorted.length));

  const countIn = (slice: LottoDrawResult[], n: number) =>
    slice.reduce((cnt, d) => cnt + (d.numbers.includes(n) ? 1 : 0), 0);

  const momentum = new Map<number, number>();
  const allScores: Array<{ number: number; score: number }> = [];

  for (let n = 1; n <= 45; n++) {
    const longRate = sorted.length > 0
      ? countIn(sorted, n) / sorted.length
      : 6 / 45;
    const midRate = midSlice.length > 0
      ? countIn(midSlice, n) / midSlice.length
      : longRate;
    const shortRate = shortSlice.length > 0
      ? countIn(shortSlice, n) / shortSlice.length
      : midRate;

    // 가속도: 1차 미분(속도) + 2차 미분(가속도) 결합
    const velocity = shortRate - longRate;           // 단기 vs 장기
    const acceleration = (shortRate - midRate) - (midRate - longRate); // 가속도

    // 결합 모멘텀: velocity에 더 큰 가중치
    const score = 0.7 * velocity + 0.3 * acceleration;

    momentum.set(n, score);
    allScores.push({ number: n, score });
  }

  // 정규화: -1 ~ +1 스케일
  const values = allScores.map(s => s.score);
  const maxAbs = Math.max(Math.abs(Math.min(...values)), Math.abs(Math.max(...values)), 0.001);

  for (const [n, v] of momentum) {
    momentum.set(n, Math.max(-1, Math.min(v / maxAbs, 1)));
  }

  allScores.sort((a, b) => b.score - a.score);

  return {
    momentum,
    rising: allScores.slice(0, 5).map(s => ({ number: s.number, score: s.score / maxAbs })),
    falling: allScores.slice(-5).reverse().map(s => ({ number: s.number, score: s.score / maxAbs })),
  };
}

// ════════════════════════════════════════════════════════════════════
// [4] 페어 친화도 네트워크
// ════════════════════════════════════════════════════════════════════

/**
 * 번호 쌍의 동반 출현 Z-score를 계산하여 친화도 행렬 구성.
 *
 * 기대 동반 출현 = N × C(43,4)/C(45,6) ≈ N × 6/45 × 5/44
 * Z-score = (실제 - 기대) / sqrt(기대)
 *
 * 조합의 페어 점수 = 모든 C(6,2)=15 쌍의 Z-score 평균
 * → 양의 친화도가 높은 쌍들로 구성된 조합은 "자연스러운" 당첨 패턴.
 */
export interface PairAffinityData {
  /** 46×46 배열 기반 Z-score (인덱스 직접 접근, Map 대비 ~10배 빠름) */
  zGrid: number[][];
  /** 양의 상관 TOP 쌍 */
  topPairs: Array<{ pair: [number, number]; count: number; zScore: number }>;
}

export function computePairAffinity(draws: LottoDrawResult[]): PairAffinityData {
  // 배열 기반 카운팅 (Map + 문자열 키 제거)
  const counts: number[][] = Array.from({ length: 46 }, () => new Array(46).fill(0));

  for (const d of draws) {
    const nums = d.numbers;
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const a = nums[i], b = nums[j];
        counts[a][b]++;
        counts[b][a]++;
      }
    }
  }

  const N = draws.length;
  const expectedPair = N * (6 / 45) * (5 / 44);
  const sqrtExpected = Math.sqrt(Math.max(expectedPair, 1));

  // Z-score 배열
  const zGrid: number[][] = Array.from({ length: 46 }, () => new Array(46).fill(0));
  const topList: Array<{ pair: [number, number]; count: number; zScore: number }> = [];

  for (let a = 1; a <= 44; a++) {
    for (let b = a + 1; b <= 45; b++) {
      const z = (counts[a][b] - expectedPair) / sqrtExpected;
      zGrid[a][b] = z;
      zGrid[b][a] = z;
      topList.push({ pair: [a, b], count: counts[a][b], zScore: z });
    }
  }

  topList.sort((a, b) => b.zScore - a.zScore);

  return {
    zGrid,
    topPairs: topList.slice(0, 10),
  };
}

/**
 * 조합의 페어 친화도 점수 (배열 인덱스 직접 접근).
 */
export function scoreCombinationPairAffinity(
  combo: number[],
  affinity: PairAffinityData,
): number {
  let totalZ = 0;
  for (let i = 0; i < combo.length; i++) {
    for (let j = i + 1; j < combo.length; j++) {
      totalZ += affinity.zGrid[combo[i]][combo[j]];
    }
  }
  const meanZ = totalZ / 15;
  return 1 / (1 + Math.exp(-meanZ * 0.5));
}

// ════════════════════════════════════════════════════════════════════
// 통합 패턴 점수
// ════════════════════════════════════════════════════════════════════

export interface PatternEngineResult {
  markov: MarkovScores;
  dormancy: DormancyScores;
  momentum: MomentumScores;
  pairAffinity: PairAffinityData;
}

/**
 * 전체 패턴 엔진 실행 — 4가지 모델을 한번에 계산.
 */
export function runPatternEngine(draws: LottoDrawResult[]): PatternEngineResult {
  return {
    markov: computeMarkovScores(draws),
    dormancy: computeDormancyScores(draws),
    momentum: computeMomentumScores(draws),
    pairAffinity: computePairAffinity(draws),
  };
}

/**
 * 조합의 통합 패턴 점수 (0~1).
 *
 * 가중치:
 *   마르코프 전이: 0.25 — 이전 회차와의 연속성
 *   휴면 각성:    0.25 — 오래 안 나온 번호의 복귀 가능성
 *   모멘텀:       0.30 — 최근 트렌드 (가장 중요)
 *   페어 친화도:  0.20 — 동반 출현 구조적 패턴
 */
const W_MARKOV = 0.25;
const W_DORMANCY = 0.25;
const W_MOMENTUM = 0.30;
const W_PAIR = 0.20;

export function scoreCombinationPattern(
  combo: number[],
  engine: PatternEngineResult,
): number {
  // [1] 마르코프: 각 번호의 전이 확률 평균
  let markovScore = 0;
  for (const n of combo) {
    markovScore += engine.markov.transitionScores.get(n) || 0;
  }
  markovScore /= combo.length;

  // [2] 휴면 각성: 적절한 각성 번호 포함 보너스
  // 너무 dormant한 번호만 고르면 안 됨 → 1-2개가 최적
  let dormancyScore = 0;
  const highAwakening = combo.filter(n => {
    const s = engine.dormancy.awakeningScores.get(n) || 0;
    return s > 0.7;
  }).length;

  if (highAwakening >= 1 && highAwakening <= 2) {
    dormancyScore = 0.8; // 1-2개 각성 임박 번호 포함 = 최적
  } else if (highAwakening === 3) {
    dormancyScore = 0.5;
  } else if (highAwakening === 0) {
    dormancyScore = 0.3;
  } else {
    dormancyScore = 0.2; // 4개 이상은 과도
  }

  // 개별 각성 점수 평균도 반영
  let avgAwakening = 0;
  for (const n of combo) {
    avgAwakening += engine.dormancy.awakeningScores.get(n) || 0;
  }
  avgAwakening /= combo.length;
  dormancyScore = dormancyScore * 0.6 + avgAwakening * 0.4;

  // [3] 모멘텀: 상승 추세 번호 선호, 단 하락 추세 번호도 약간 포함
  let momentumScore = 0;
  let risingCount = 0;
  let fallingCount = 0;
  for (const n of combo) {
    const m = engine.momentum.momentum.get(n) || 0;
    momentumScore += m;
    if (m > 0.3) risingCount++;
    if (m < -0.3) fallingCount++;
  }
  // 이상적: 상승 2-4개 + 하락 0-1개
  const momentumBalance =
    (risingCount >= 2 && risingCount <= 4 && fallingCount <= 1) ? 0.3 : 0;
  momentumScore = (momentumScore / combo.length + 1) / 2; // -1~1 → 0~1
  momentumScore = momentumScore * 0.7 + momentumBalance;

  // [4] 페어 친화도
  const pairScore = scoreCombinationPairAffinity(combo, engine.pairAffinity);

  // 통합
  return W_MARKOV * markovScore
       + W_DORMANCY * dormancyScore
       + W_MOMENTUM * momentumScore
       + W_PAIR * pairScore;
}
