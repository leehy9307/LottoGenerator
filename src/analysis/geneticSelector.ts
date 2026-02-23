import { LottoDrawResult } from '../types/lotto';
import { buildWinningProfile, scoreCombinationProfile } from './profileMatcher';
import { normalizeScores } from './trendAnalysis';
import { getBallColorGroup } from '../constants/ballColors';

/**
 * Genetic Algorithm Selector — Phase 2 진화 알고리즘
 *
 * Population: 200, Generations: 50
 * Tournament Selection(3) + Crossover + Mutation(0.15) + Elitism(10%)
 *
 * 다목적 적합도:
 *   AntiPop(40%) + ProfileMatch(35%) + Coverage(25%)
 */

type Chromosome = number[]; // 6개 번호 (정렬됨)

interface Individual {
  chromosome: Chromosome;
  fitness: number;
}

const POPULATION_SIZE = 200;
const GENERATIONS = 50;
const TOURNAMENT_SIZE = 3;
const MUTATION_RATE = 0.15;
const ELITISM_COUNT = Math.floor(POPULATION_SIZE * 0.10); // 10%

/**
 * GA 메인: 풀에서 최적의 6개 번호 조합을 진화적으로 탐색
 *
 * @param pool Phase 1에서 선택된 번호 풀
 * @param draws 역대 추첨 데이터
 * @param antiPopScores 정규화된 비인기 점수 (Map<number, number>)
 * @param pairScores 정규화된 쌍 상관관계 점수 (Map<number, number>)
 * @param rng 난수 생성기
 * @returns 최적 6개 번호 (정렬됨) 또는 null (수렴 실패)
 */
export function evolveOptimalCombination(
  pool: number[],
  draws: LottoDrawResult[],
  antiPopScores: Map<number, number>,
  pairScores: Map<number, number>,
  rng: () => number,
): number[] | null {
  if (pool.length < 6) return null;

  // 프로필 구축
  const profile = buildWinningProfile(draws);
  const normAntiPop = antiPopScores;
  const normPair = pairScores;

  // 적합도 함수
  function fitness(chromosome: Chromosome): number {
    // 기본 제약조건 위반 시 페널티
    if (!satisfiesConstraints(chromosome)) {
      return 0.001; // 거의 0이지만 완전 제거하지 않음 (유전 다양성 유지)
    }

    // (1) AntiPopularity 점수 (40%)
    const antiPopAvg = chromosome.reduce(
      (sum, n) => sum + (normAntiPop.get(n) || 0), 0
    ) / 6;

    // (2) Profile Match 점수 (35%)
    const profileScore = scoreCombinationProfile(chromosome, profile);

    // (3) Coverage/Diversity 점수 (25%)
    const coverageScore = computeCoverageScore(chromosome, normPair);

    return antiPopAvg * 0.40 + profileScore * 0.35 + coverageScore * 0.25;
  }

  // 초기 개체군 생성
  let population: Individual[] = [];
  for (let i = 0; i < POPULATION_SIZE; i++) {
    const chromo = randomChromosome(pool, rng);
    population.push({ chromosome: chromo, fitness: fitness(chromo) });
  }

  // 세대 진화
  for (let gen = 0; gen < GENERATIONS; gen++) {
    // 적합도 내림차순 정렬
    population.sort((a, b) => b.fitness - a.fitness);

    const newPopulation: Individual[] = [];

    // Elitism: 상위 10% 보존
    for (let i = 0; i < ELITISM_COUNT; i++) {
      newPopulation.push({ ...population[i] });
    }

    // 나머지는 교차 + 돌연변이로 생성
    while (newPopulation.length < POPULATION_SIZE) {
      const parent1 = tournamentSelect(population, rng);
      const parent2 = tournamentSelect(population, rng);

      let child = crossover(parent1.chromosome, parent2.chromosome, pool, rng);
      child = mutate(child, pool, rng);

      // 정렬
      child.sort((a, b) => a - b);

      newPopulation.push({ chromosome: child, fitness: fitness(child) });
    }

    population = newPopulation;
  }

  // 최종 세대에서 최적 개체 선택
  population.sort((a, b) => b.fitness - a.fitness);
  const best = population[0];

  // 최소 적합도 임계값 확인
  if (best.fitness < 0.1) {
    return null; // GA 수렴 실패 → fallback 사용
  }

  return best.chromosome.sort((a, b) => a - b);
}

// ─── 유전 연산 ──────────────────────────────────────────────────

/**
 * 랜덤 크로모좀 생성 (풀에서 6개 비복원추출)
 */
function randomChromosome(pool: number[], rng: () => number): Chromosome {
  const shuffled = [...pool];
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 6).sort((a, b) => a - b);
}

/**
 * Tournament Selection (크기 3)
 */
function tournamentSelect(
  population: Individual[],
  rng: () => number,
): Individual {
  let best: Individual | null = null;
  for (let i = 0; i < TOURNAMENT_SIZE; i++) {
    const idx = Math.floor(rng() * population.length);
    const candidate = population[idx];
    if (!best || candidate.fitness > best.fitness) {
      best = candidate;
    }
  }
  return best!;
}

/**
 * Crossover: 두 부모의 번호를 합친 후 6개 선택
 * Uniform crossover 변형 — 공통 번호 유지, 나머지 랜덤 선택
 */
function crossover(
  parent1: Chromosome,
  parent2: Chromosome,
  pool: number[],
  rng: () => number,
): Chromosome {
  const set1 = new Set(parent1);
  const set2 = new Set(parent2);

  // 공통 번호는 반드시 포함
  const common: number[] = parent1.filter(n => set2.has(n));
  const unique1 = parent1.filter(n => !set2.has(n));
  const unique2 = parent2.filter(n => !set1.has(n));

  const child: number[] = [...common];
  const candidates = [...unique1, ...unique2];

  // Fisher-Yates shuffle candidates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const used = new Set(child);
  for (const c of candidates) {
    if (child.length >= 6) break;
    if (!used.has(c)) {
      child.push(c);
      used.add(c);
    }
  }

  // 부족하면 풀에서 랜덤 보충
  if (child.length < 6) {
    const remaining = pool.filter(n => !used.has(n));
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    for (const r of remaining) {
      if (child.length >= 6) break;
      child.push(r);
    }
  }

  return child;
}

/**
 * Mutation: 확률적으로 하나의 번호를 풀 내 다른 번호로 교체
 */
function mutate(
  chromosome: Chromosome,
  pool: number[],
  rng: () => number,
): Chromosome {
  if (rng() > MUTATION_RATE) return [...chromosome];

  const result = [...chromosome];
  const inSet = new Set(result);
  const available = pool.filter(n => !inSet.has(n));

  if (available.length === 0) return result;

  // 랜덤 위치 선택하여 교체
  const replaceIdx = Math.floor(rng() * result.length);
  const newNum = available[Math.floor(rng() * available.length)];
  result[replaceIdx] = newNum;

  return result;
}

// ─── 제약조건 ──────────────────────────────────────────────────

function satisfiesConstraints(numbers: number[]): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);

  // 합계 100~175
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (sum < 100 || sum > 175) return false;

  // 홀수 2~4
  const oddCount = sorted.filter(n => n % 2 === 1).length;
  if (oddCount < 2 || oddCount > 4) return false;

  // 저번호(≤22) 2~4
  const lowCount = sorted.filter(n => n <= 22).length;
  if (lowCount < 2 || lowCount > 4) return false;

  // 색상 그룹 3개 이상
  const colorGroups = new Set(sorted.map(n => getBallColorGroup(n)));
  if (colorGroups.size < 3) return false;

  // 고번호(≥32) 최소 1개
  if (sorted.filter(n => n >= 32).length < 1) return false;

  // 끝자리 4개 이상 다양
  const lastDigits = new Set(sorted.map(n => n % 10));
  if (lastDigits.size < 4) return false;

  // 등차수열 차단
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    diffs.push(sorted[i] - sorted[i - 1]);
  }
  if (diffs.every(d => d === diffs[0])) return false;

  // 동일 10단위 4개 이상 차단
  const decades = new Map<number, number>();
  for (const n of sorted) {
    const dec = Math.floor((n - 1) / 10);
    decades.set(dec, (decades.get(dec) || 0) + 1);
  }
  for (const count of decades.values()) {
    if (count >= 4) return false;
  }

  // 3개 이상 연속번호 차단
  let consecutiveRun = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      consecutiveRun++;
      if (consecutiveRun >= 3) return false;
    } else {
      consecutiveRun = 1;
    }
  }

  return true;
}

// ─── 커버리지/다양성 점수 ──────────────────────────────────────

/**
 * 쌍 상관관계 + 구간 분포 기반 커버리지 점수
 */
function computeCoverageScore(
  chromosome: Chromosome,
  pairScores: Map<number, number>,
): number {
  // (1) 쌍 상관관계 평균 (60%)
  const pairAvg = chromosome.reduce(
    (sum, n) => sum + (pairScores.get(n) || 0), 0
  ) / 6;

  // (2) 구간 분포 균일성 (40%)
  // 5개 구간에 걸쳐 분포할수록 점수 높음
  const zones = new Set<number>();
  for (const n of chromosome) {
    zones.add(n >= 40 ? 4 : Math.floor((n - 1) / 10));
  }
  const zoneCoverage = zones.size / 5; // 0~1

  return pairAvg * 0.60 + zoneCoverage * 0.40;
}
