import { LottoDrawResult } from '../types/lotto';

/**
 * Recency-weighted frequency: more recent draws get higher weight
 * Uses exponential decay: weight = e^(-lambda * age)
 */
export function recencyWeightedFrequency(draws: LottoDrawResult[]): Map<number, number> {
  const sorted = [...draws].sort((a, b) => a.drawNo - b.drawNo);
  const totalDraws = sorted.length;
  const lambda = 0.03; // decay rate
  const scores = new Map<number, number>();

  for (let i = 1; i <= 45; i++) {
    scores.set(i, 0);
  }

  for (let idx = 0; idx < totalDraws; idx++) {
    const age = totalDraws - 1 - idx; // most recent = 0
    const weight = Math.exp(-lambda * age);
    for (const num of sorted[idx].numbers) {
      scores.set(num, (scores.get(num) || 0) + weight);
    }
  }

  return scores;
}

/**
 * Momentum: compare frequency in recent 20 draws vs previous 20 draws
 * Positive momentum = number appearing more frequently recently
 */
export function calculateMomentum(draws: LottoDrawResult[]): Map<number, number> {
  const sorted = [...draws].sort((a, b) => a.drawNo - b.drawNo);
  const n = sorted.length;
  const recentWindow = Math.min(20, Math.floor(n / 2));
  const recent = sorted.slice(n - recentWindow);
  const previous = sorted.slice(n - 2 * recentWindow, n - recentWindow);

  const momentum = new Map<number, number>();

  for (let i = 1; i <= 45; i++) {
    const recentCount = recent.filter(d => d.numbers.includes(i)).length;
    const prevCount = previous.filter(d => d.numbers.includes(i)).length;
    // Normalize by window size
    const recentRate = recentCount / recentWindow;
    const prevRate = prevCount / (previous.length || 1);
    momentum.set(i, recentRate - prevRate);
  }

  return momentum;
}

/**
 * Gap analysis: how many draws since each number last appeared
 * Lower gap = appeared recently, higher gap = overdue
 */
export function calculateGaps(draws: LottoDrawResult[]): Map<number, number> {
  const sorted = [...draws].sort((a, b) => b.drawNo - a.drawNo); // most recent first
  const gaps = new Map<number, number>();

  for (let i = 1; i <= 45; i++) {
    const idx = sorted.findIndex(d => d.numbers.includes(i));
    gaps.set(i, idx === -1 ? sorted.length : idx);
  }

  return gaps;
}

/**
 * Normalize a map of scores to 0-1 range
 */
export function normalizeScores(scores: Map<number, number>): Map<number, number> {
  const values = Array.from(scores.values());
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const normalized = new Map<number, number>();
  for (const [key, val] of scores) {
    normalized.set(key, (val - min) / range);
  }
  return normalized;
}
