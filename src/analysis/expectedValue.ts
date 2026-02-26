/**
 * Expected Value Calculator — Full-Rank EV with Korean Tax Brackets
 *
 * Computes expected value across all prize tiers (1st~5th),
 * applying Korean tax law:
 *   ≤50,000: tax-free
 *   ≤300,000,000: 22% (income tax 20% + local 2%)
 *   >300,000,000: 33% (income tax 30% + local 3%)
 *
 * Also estimates co-winners for 1st prize using population model.
 */

// ─── Prize Probabilities ────────────────────────────────────────

const TOTAL_COMBINATIONS = 8_145_060;

// Exact probabilities for Korean Lotto 6/45
const PRIZE_TIERS = [
  { rank: 1, probability: 1 / TOTAL_COMBINATIONS,         label: '1등' },
  { rank: 2, probability: 6 / TOTAL_COMBINATIONS,         label: '2등' },
  { rank: 3, probability: 216 / TOTAL_COMBINATIONS,       label: '3등' },
  { rank: 4, probability: 11_115 / TOTAL_COMBINATIONS,    label: '4등' },
  { rank: 5, probability: 182_780 / TOTAL_COMBINATIONS,   label: '5등' },
];

// Fixed prizes for ranks 4 and 5
const FIXED_PRIZES: Record<number, number> = {
  4: 50_000,
  5: 5_000,
};

// ─── Korean Tax Calculation ─────────────────────────────────────

/**
 * Apply Korean lottery tax brackets.
 * ≤50,000: no tax
 * ≤300,000,000: 22%
 * >300,000,000: 33%
 */
function applyKoreanTax(prize: number): number {
  if (prize <= 50_000) return prize;

  if (prize <= 300_000_000) {
    return prize * (1 - 0.22);
  }

  // Progressive: first 300M at 22%, rest at 33%
  const taxOn300M = 300_000_000 * 0.22;
  const taxOnRest = (prize - 300_000_000) * 0.33;
  return prize - taxOn300M - taxOnRest;
}

// ─── Jackpot Estimation ─────────────────────────────────────────

export interface JackpotEstimate {
  estimatedJackpot: number;       // pre-tax 1st prize total
  perPersonJackpot: number;       // post-tax per person
  estimatedCoWinners: number;
}

/**
 * Estimate 1st prize jackpot based on carryover state.
 */
export function estimateJackpot(
  carryoverMisses: number,
  estimatedCoWinners: number,
  estimatedWeeklySales: number = 70_000_000_000,
): JackpotEstimate {
  const prizePoolRate = 0.5;
  const firstPrizeRate = 0.75;

  const baseJackpot = estimatedWeeklySales * prizePoolRate * firstPrizeRate;
  const carryoverAmount = baseJackpot * carryoverMisses;
  const estimatedJackpot = baseJackpot + carryoverAmount;

  // Sales increase during carryover
  const salesMultiplier = 1 + carryoverMisses * 0.3;
  const adjustedCoWinners = estimatedCoWinners * salesMultiplier;
  const effectiveWinners = Math.max(adjustedCoWinners, 1);

  const perPersonPrize = estimatedJackpot / effectiveWinners;
  const perPersonJackpot = applyKoreanTax(perPersonPrize);

  return {
    estimatedJackpot,
    perPersonJackpot,
    estimatedCoWinners: adjustedCoWinners,
  };
}

// ─── Full Expected Value Calculation ────────────────────────────

export interface ExpectedValueResult {
  totalEV: number;              // total expected value per 1,000 won game
  evByRank: {                   // EV breakdown by rank
    ev1: number;
    ev2: number;
    ev3: number;
    ev4: number;
    ev5: number;
  };
  recommendation: 'strong_buy' | 'buy' | 'neutral' | 'skip';
  reasoning: string;
  confidenceScore: number;
}

/**
 * Calculate full expected value across all prize tiers.
 */
export function calculateExpectedValue(
  carryoverMisses: number,
  estimatedCoWinners: number,
  mcmcConverged: boolean,
  estimatedWeeklySales: number = 70_000_000_000,
): ExpectedValueResult {
  const ticketPrice = 1000;

  const jackpot = estimateJackpot(
    carryoverMisses, estimatedCoWinners, estimatedWeeklySales
  );

  // Rank-by-rank EV
  const prizePoolRate = 0.5;
  const weeklyPrizePool = estimatedWeeklySales * prizePoolRate;

  // 2nd prize: ~12.5% of prize pool
  const secondPrize = applyKoreanTax(weeklyPrizePool * 0.125 / 6);
  // 3rd prize: ~12.5% of prize pool
  const thirdPrize = applyKoreanTax(weeklyPrizePool * 0.125 / 216);

  const ev1 = PRIZE_TIERS[0].probability * jackpot.perPersonJackpot;
  const ev2 = PRIZE_TIERS[1].probability * secondPrize;
  const ev3 = PRIZE_TIERS[2].probability * thirdPrize;
  const ev4 = PRIZE_TIERS[3].probability * FIXED_PRIZES[4];
  const ev5 = PRIZE_TIERS[4].probability * FIXED_PRIZES[5];

  const totalEV = ev1 + ev2 + ev3 + ev4 + ev5 - ticketPrice;

  // Recommendation
  let recommendation: ExpectedValueResult['recommendation'];
  let reasoning: string;
  let confidenceScore: number;

  if (totalEV > 0 && carryoverMisses >= 2) {
    recommendation = 'strong_buy';
    reasoning = `${carryoverMisses}회 이월로 기대값 양수 전환 (+${Math.round(totalEV)}원). 비인기 조합으로 공동당첨 최소화.`;
    confidenceScore = mcmcConverged ? 0.90 : 0.65;
  } else if (carryoverMisses >= 1) {
    recommendation = 'buy';
    reasoning = `${carryoverMisses}회 이월로 기대값 개선 중. 추정 공동당첨자 ${jackpot.estimatedCoWinners.toFixed(1)}명.`;
    confidenceScore = mcmcConverged ? 0.75 : 0.55;
  } else if (totalEV > -400) {
    recommendation = 'neutral';
    reasoning = '정상 회차. 비인기 조합 선택으로 당첨 시 분배금 최대화 전략 적용.';
    confidenceScore = mcmcConverged ? 0.65 : 0.45;
  } else {
    recommendation = 'skip';
    reasoning = '기대값이 크게 불리한 구간. 구매 비추천.';
    confidenceScore = mcmcConverged ? 0.60 : 0.40;
  }

  return {
    totalEV: Math.round(totalEV),
    evByRank: {
      ev1: Math.round(ev1 * 100) / 100,
      ev2: Math.round(ev2 * 100) / 100,
      ev3: Math.round(ev3 * 100) / 100,
      ev4: Math.round(ev4 * 100) / 100,
      ev5: Math.round(ev5 * 100) / 100,
    },
    recommendation,
    reasoning,
    confidenceScore,
  };
}

// ─── Utility ────────────────────────────────────────────────────

export function formatKoreanWon(amount: number): string {
  if (amount >= 100_000_000_000) {
    return `${(amount / 100_000_000_000).toFixed(0)}천억원`;
  }
  if (amount >= 100_000_000) {
    return `${(amount / 100_000_000).toFixed(0)}억원`;
  }
  if (amount >= 10_000) {
    return `${(amount / 10_000).toFixed(0)}만원`;
  }
  return `${amount}원`;
}
