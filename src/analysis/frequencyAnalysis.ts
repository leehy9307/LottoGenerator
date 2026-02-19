import { LottoDrawResult, NumberFrequency } from '../types/lotto';

export function calculateFrequencies(draws: LottoDrawResult[]): NumberFrequency[] {
  const counts = new Array(46).fill(0); // index 0 unused

  for (const draw of draws) {
    for (const num of draw.numbers) {
      counts[num]++;
    }
  }

  const total = draws.length;
  const frequencies: NumberFrequency[] = [];

  for (let i = 1; i <= 45; i++) {
    frequencies.push({
      number: i,
      count: counts[i],
      percentage: (counts[i] / total) * 100,
    });
  }

  return frequencies;
}

export function getHotNumbers(frequencies: NumberFrequency[], count: number = 6): NumberFrequency[] {
  return [...frequencies]
    .sort((a, b) => b.count - a.count || a.number - b.number)
    .slice(0, count);
}

export function getColdNumbers(frequencies: NumberFrequency[], count: number = 6): NumberFrequency[] {
  return [...frequencies]
    .sort((a, b) => a.count - b.count || a.number - b.number)
    .slice(0, count);
}

export function getExpectedFrequency(totalDraws: number): number {
  // Each draw picks 6 from 45, so expected count per number = totalDraws * 6 / 45
  return (totalDraws * 6) / 45;
}
