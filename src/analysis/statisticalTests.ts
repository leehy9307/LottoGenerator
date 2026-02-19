import { NumberFrequency } from '../types/lotto';
import { getExpectedFrequency } from './frequencyAnalysis';

/**
 * Chi-square goodness-of-fit test
 * Tests whether the observed frequencies differ significantly from expected uniform distribution
 */
export function chiSquareTest(
  frequencies: NumberFrequency[],
  totalDraws: number
): { chiSquare: number; degreesOfFreedom: number; pValue: number; isUniform: boolean } {
  const expected = getExpectedFrequency(totalDraws);
  let chiSquare = 0;

  for (const freq of frequencies) {
    chiSquare += Math.pow(freq.count - expected, 2) / expected;
  }

  const df = frequencies.length - 1; // 44 degrees of freedom
  const pValue = chiSquarePValue(chiSquare, df);

  return {
    chiSquare,
    degreesOfFreedom: df,
    pValue,
    isUniform: pValue > 0.05, // fail to reject H0 at 5% significance
  };
}

/**
 * Approximate chi-square p-value using Wilson-Hilferty transformation
 */
function chiSquarePValue(x: number, df: number): number {
  if (df <= 0 || x < 0) return 1;

  // Wilson-Hilferty normal approximation
  const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
  const se = Math.sqrt(2 / (9 * df));
  const zScore = z / se;

  // Standard normal CDF approximation (upper tail)
  return 1 - normalCDF(zScore);
}

function normalCDF(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;

  let sum = 0;
  let term = z;
  for (let i = 3; i <= 99; i += 2) {
    sum += term;
    term *= (z * z) / i;
  }
  return 0.5 + sum * Math.exp(-0.5 * z * z - 0.91893853320467274178);
}

export function standardDeviation(frequencies: NumberFrequency[]): number {
  const mean = frequencies.reduce((sum, f) => sum + f.count, 0) / frequencies.length;
  const variance =
    frequencies.reduce((sum, f) => sum + Math.pow(f.count - mean, 2), 0) / frequencies.length;
  return Math.sqrt(variance);
}
