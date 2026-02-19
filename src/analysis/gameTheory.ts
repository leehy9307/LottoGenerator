import { LottoDrawResult } from '../types/lotto';

/**
 * 게임이론 기반 분석 모듈 (v2.0)
 *
 * 핵심 원리: 당첨 확률은 바꿀 수 없지만 (1/8,145,060 고정),
 * 당첨 시 기대 수령액을 최대화할 수 있다.
 *
 * E(수령액) = P(당첨) × (당첨금 총액 / 예상 동일번호 선택자 수)
 * → P(당첨)은 고정이므로 "동일번호 선택자 수"를 최소화하는 조합을 선택
 *
 * 참고: Nash Equilibrium 분석, 이스라엘/한국 로또 선택 편향 연구
 */

// ─── 인기번호 페널티 (Anti-Popularity Score) ───────────────────────

/**
 * 한국 로또 구매자 행동 편향 기반 인기도 추정
 * 인기가 높을수록 페널티 (낮은 점수)
 *
 * 편향 소스:
 * 1. 생일 편향: 1~31에 집중 (월/일 조합)
 * 2. 행운의 숫자: 7, 3, 8 계열 선호
 * 3. 시각적 패턴: 용지 상단 숫자 선호
 * 4. 라운드 넘버: 10, 20, 30, 40 선호
 * 5. 이전 당첨번호 모방
 */
export function calculateAntiPopularity(draws: LottoDrawResult[]): Map<number, number> {
  const scores = new Map<number, number>();

  for (let i = 1; i <= 45; i++) {
    let popularity = 0;

    // (1) 생일 편향: 1~12 (월) 가장 인기, 13~31 (일) 인기, 32~45 비인기
    if (i <= 12) {
      popularity += 0.35; // 월+일 모두 해당
    } else if (i <= 31) {
      popularity += 0.20; // 일(day)만 해당
    } else {
      popularity += 0.0;  // 생일로 선택 불가 → 비인기 영역
    }

    // (2) 행운의 숫자 편향
    const luckyNumbers: Record<number, number> = {
      7: 0.15, 3: 0.10, 8: 0.08,  // 최고 인기
      17: 0.08, 27: 0.06, 37: 0.05, // 7 계열
      13: 0.04, 23: 0.03, 33: 0.03, 43: 0.02, // 3 계열
    };
    popularity += luckyNumbers[i] || 0;

    // (3) 라운드 넘버 편향
    if (i % 10 === 0) {
      popularity += 0.06;
    } else if (i % 5 === 0) {
      popularity += 0.03;
    }

    // (4) 용지 위치 편향 (상단 숫자 선호)
    // 로또 용지: 1~45가 가로 7열로 배치 → 상단일수록 인기
    const row = Math.ceil(i / 7); // 1~7행
    popularity += Math.max(0, (7 - row) * 0.015);

    // (5) 최근 당첨번호 모방 편향
    // 직전 5회 당첨번호를 그대로 쓰는 사람이 많음
    const recentDraws = draws.slice(-5);
    for (const draw of recentDraws) {
      if (draw.numbers.includes(i)) {
        popularity += 0.02;
      }
    }

    // Anti-Popularity: 인기가 높을수록 낮은 점수 (역수)
    // 점수 범위를 0~1로 정규화하기 위해 1에서 뺌
    scores.set(i, 1 - Math.min(popularity, 0.95));
  }

  return scores;
}

// ─── 번호 쌍 상관관계 (Pair Correlation) ──────────────────────────

/**
 * 역대 당첨번호에서 함께 출현한 번호 쌍의 빈도 분석
 * 자주 함께 나온 쌍의 번호에 가산점
 *
 * 활용: LSTM/Transformer 모델이 학습하는 "시퀀스 패턴"의
 *       경량 근사(lightweight approximation)
 */
export function calculatePairCorrelation(draws: LottoDrawResult[]): Map<number, number> {
  // 45×45 동시출현 행렬
  const coMatrix: number[][] = Array.from({ length: 46 }, () => new Array(46).fill(0));

  for (const draw of draws) {
    for (let a = 0; a < draw.numbers.length; a++) {
      for (let b = a + 1; b < draw.numbers.length; b++) {
        coMatrix[draw.numbers[a]][draw.numbers[b]]++;
        coMatrix[draw.numbers[b]][draw.numbers[a]]++;
      }
    }
  }

  // 각 번호의 평균 쌍 강도 계산
  const scores = new Map<number, number>();
  for (let i = 1; i <= 45; i++) {
    let totalStrength = 0;
    let count = 0;
    for (let j = 1; j <= 45; j++) {
      if (i === j) continue;
      totalStrength += coMatrix[i][j];
      count++;
    }
    scores.set(i, totalStrength / count);
  }

  return scores;
}

// ─── 분포 엔트로피 (Distribution Entropy) ─────────────────────────

/**
 * 선택된 6개 번호가 45개 번호 공간에 얼마나 균일하게 분포하는지 측정
 *
 * 원리: 번호를 5개 구간(1-9, 10-19, 20-29, 30-39, 40-45)으로 나누어
 *       각 구간에서 최소 1개씩 포함되도록 유도
 *       → 사람들은 특정 구간에 편중하므로, 균일 분포 = 비인기 = 기대값 높음
 *
 * Shannon Entropy: H = -Σ(p_i × log2(p_i))
 */
export function distributionEntropyScore(number: number, draws: LottoDrawResult[]): number {
  // 각 번호가 속한 구간의 "다른 구매자 밀집도" 역수
  // 구간별 인기도 추정 (한국 로또 기준)
  const zonePopularity: Record<number, number> = {
    0: 0.28, // 1~9:   생일(월) 영역, 높은 인기
    1: 0.25, // 10~19: 생일(일) + 10대, 높은 인기
    2: 0.22, // 20~29: 생일(일), 중간 인기
    3: 0.15, // 30~39: 일부 생일(30,31) + 비인기
    4: 0.10, // 40~45: 가장 비인기 → 기대값 최고
  };

  const zone = number >= 40 ? 4 : Math.floor((number - 1) / 10);
  // 비인기 구간일수록 높은 점수
  return 1 - (zonePopularity[zone] || 0.2);
}

// ─── 연속번호 보너스 (Consecutive Number Bonus) ───────────────────

/**
 * 사람들은 연속번호 조합(예: 5,6 또는 23,24,25)을 "이상하다"고 느껴 회피
 * → 연속번호를 포함하면 당첨 시 분할 확률 감소
 *
 * 실제 통계: 전체 당첨조합 중 약 40%가 최소 하나의 연속쌍 포함
 * 그러나 구매자 중 연속번호를 선택하는 비율은 이보다 현저히 낮음
 */
export function consecutivePairPotential(
  number: number,
  draws: LottoDrawResult[]
): number {
  // 해당 번호와 ±1 번호가 함께 당첨된 빈도
  let pairCount = 0;
  let totalDraws = 0;

  for (const draw of draws) {
    totalDraws++;
    if (draw.numbers.includes(number)) {
      if (number > 1 && draw.numbers.includes(number - 1)) pairCount++;
      if (number < 45 && draw.numbers.includes(number + 1)) pairCount++;
    }
  }

  // 연속쌍 잠재력이 있으면서 실제로도 자주 출현한 번호에 보너스
  return totalDraws > 0 ? pairCount / totalDraws : 0;
}

// ─── 이월(캐리오버) 기대값 분석 ──────────────────────────────────

/**
 * 이월 상태에서의 기대값 변화를 계산
 *
 * 정상 상태: E ≈ -570원 (1,000원 투자 기준)
 * 1회 이월:  E ≈ -300원
 * 2회 이월:  E ≈ +44원 (양수 전환 가능)
 *
 * Kelly Criterion: f* = (bp - q) / b
 * f* > 0 일 때만 베팅 권장
 */
export interface CarryoverAnalysis {
  estimatedJackpot: number;     // 추정 1등 당첨금 (원)
  expectedValue: number;        // 기대값 (원, 1,000원 기준)
  kellyFraction: number;        // 켈리 기준 최적 베팅 비율
  recommendation: 'strong_buy' | 'buy' | 'neutral' | 'skip';
  confidenceScore: number;      // 0~1 전략 신뢰도
}

export function analyzeCarryover(
  consecutiveMisses: number,
  estimatedWeeklySales: number = 70_000_000_000, // 700억원 기본값
): CarryoverAnalysis {
  const ticketPrice = 1000;
  const totalCombinations = 8_145_060;
  const prizePoolRate = 0.5;  // 판매액의 50%가 당첨금
  const firstPrizeRate = 0.75; // 당첨금 중 75%가 1등

  // 이월 누적 시 1등 당첨금 추정
  const baseJackpot = estimatedWeeklySales * prizePoolRate * firstPrizeRate;
  const carryoverAmount = baseJackpot * consecutiveMisses;
  const estimatedJackpot = baseJackpot + carryoverAmount;

  // 세후 당첨금 (22% 세금)
  const afterTax = estimatedJackpot * 0.78;

  // 예상 당첨자 수 (이월 시 판매 증가 반영)
  const salesMultiplier = 1 + consecutiveMisses * 0.3; // 이월 시 판매 30% 증가 추정
  const adjustedSales = estimatedWeeklySales * salesMultiplier;
  const totalTickets = adjustedSales / ticketPrice;
  const expectedWinners = totalTickets / totalCombinations;

  // 1인당 예상 당첨금
  const perPersonPrize = afterTax / Math.max(expectedWinners, 1);

  // 기대값 계산 (하위 등수 기대값 약 185원 포함)
  const lowerPrizeEV = 185;
  const firstPrizeEV = perPersonPrize / totalCombinations;
  const expectedValue = firstPrizeEV + lowerPrizeEV - ticketPrice;

  // Kelly Criterion
  const b = perPersonPrize / ticketPrice - 1;
  const p = 1 / totalCombinations;
  const q = 1 - p;
  const kellyFraction = (b * p - q) / b;

  // 추천 등급
  let recommendation: CarryoverAnalysis['recommendation'];
  let confidenceScore: number;

  if (kellyFraction > 0 && expectedValue > 0) {
    recommendation = 'strong_buy';
    confidenceScore = Math.min(0.95, 0.7 + consecutiveMisses * 0.1);
  } else if (consecutiveMisses >= 1) {
    recommendation = 'buy';
    confidenceScore = 0.5 + consecutiveMisses * 0.1;
  } else if (expectedValue > -300) {
    recommendation = 'neutral';
    confidenceScore = 0.35;
  } else {
    recommendation = 'skip';
    confidenceScore = 0.2;
  }

  return {
    estimatedJackpot,
    expectedValue: Math.round(expectedValue),
    kellyFraction,
    recommendation,
    confidenceScore,
  };
}

// ─── 종합 전략 메타데이터 ─────────────────────────────────────────

export interface StrategyMeta {
  algorithmVersion: string;
  factors: {
    name: string;
    weight: number;
    description: string;
  }[];
  carryover: CarryoverAnalysis;
  antiPopularityApplied: boolean;
  pairCorrelationApplied: boolean;
  distributionEntropyApplied: boolean;
}
