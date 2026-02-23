import { LottoDrawResult, StrategyInfo } from '../types/lotto';
import {
  calculateAntiPopularity,
  calculatePairCorrelation,
  analyzeCarryover,
} from './gameTheory';
import { normalizeScores } from './trendAnalysis';
import { selectPool } from './poolSelector';
import { evolveOptimalCombination } from './geneticSelector';
import { scoreCombinationProfile, buildWinningProfile } from './profileMatcher';
import { getBallColorGroup } from '../constants/ballColors';

const ALGORITHM_VERSION = '5.0.0';

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │  v5.0 Expert-Grade — Ultimate Ensemble + Genetic Algorithm  │
 * ├─────────────────────────────────────────────────────────────┤
 * │                                                             │
 * │  핵심 변경 (vs v4.0):                                       │
 * │  ① 5-Model → 7-Model (Spectral + Network 추가)             │
 * │  ② RRF → Hybrid Fusion (RRF + Quantum Interference)        │
 * │  ③ 고정 18 → Dynamic Pool Sizing (한계 EV)                 │
 * │  ④ Temperature Sampling → Genetic Algorithm Phase 2        │
 * │  ⑤ Winning Profile Matching (구조적 프로필 일치도)          │
 * │                                                             │
 * │  Phase 1: Pool Selection (45 → P*)                          │
 * │    7개 모델 → RRF + Quantum Interference → Dynamic P*       │
 * │                                                             │
 * │  Phase 2: Selection (P* → 6) via Genetic Algorithm          │
 * │    Population 200 × 50 gen, AntiPop+Profile+Coverage        │
 * │    Fallback: Temperature sampling (안전장치)                │
 * │                                                             │
 * │  Phase 3: Validation + Profile Match + Partial EV           │
 * │                                                             │
 * └─────────────────────────────────────────────────────────────┘
 */

// ─── PRNG ─────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createTimeSeed(): number {
  const now = Date.now();
  const d = new Date();
  return (now ^ (d.getMilliseconds() * 65537)
    ^ (d.getSeconds() * 2147483647)
    ^ (d.getMinutes() * 16777259)) >>> 0;
}

// ─── Expert Pick v5.0 ────────────────────────────────────────────

export interface ExpertPickResult {
  numbers: number[];
  strategy: StrategyInfo;
}

/**
 * Expert Pick v5.0 — 7-Model Ensemble + Genetic Algorithm
 *
 * Phase 1: 7-Model Ensemble → Hybrid Fusion → Dynamic Pool (P*)
 * Phase 2: Genetic Algorithm (P* → 6) | Fallback: Temperature Sampling
 * Phase 3: Validation + Profile Match + Partial Match EV
 */
export function generateExpertPick(
  draws: LottoDrawResult[],
  timestamp?: number,
  carryoverMisses: number = 0,
): ExpertPickResult {
  const now = timestamp ? new Date(timestamp) : new Date();
  const seed = createTimeSeed();
  const rng = mulberry32(seed);

  // ══════════════════════════════════════════════════════════════
  // Phase 1: Pool Selection (45 → P*)
  // ══════════════════════════════════════════════════════════════

  const poolResult = selectPool(draws);
  let pool = poolResult.pool;

  // ══════════════════════════════════════════════════════════════
  // Phase 2: Selection (pool → 6) via Genetic Algorithm
  // ══════════════════════════════════════════════════════════════

  const antiPopScores = calculateAntiPopularity(draws);
  const pairScores = calculatePairCorrelation(draws);
  const normAntiPop = normalizeScores(antiPopScores);
  const normPair = normalizeScores(pairScores);

  // GA 시도
  let numbers = evolveOptimalCombination(pool, draws, normAntiPop, normPair, rng);

  // 최근 2회 당첨번호 충돌 검사
  const recentNumbers = new Set<number>();
  const sortedDraws = [...draws].sort((a, b) => b.drawNo - a.drawNo);
  for (let i = 0; i < Math.min(2, sortedDraws.length); i++) {
    for (const n of sortedDraws[i].numbers) {
      recentNumbers.add(n);
    }
  }

  // GA 결과 검증 (최근 번호 충돌 체크 포함)
  if (numbers && validateRecentCollision(numbers, recentNumbers)) {
    // GA 성공
  } else {
    // Fallback: Temperature Sampling (v4.0 방식)
    const poolScored = buildPoolScores(pool, normAntiPop, normPair, now, rng);
    const fallbackResult = selectFromPool(poolScored, pool, draws, pool.length, recentNumbers);
    numbers = fallbackResult.numbers;
  }

  // ══════════════════════════════════════════════════════════════
  // Phase 3: 전략 메타데이터 + Profile Match
  // ══════════════════════════════════════════════════════════════

  const carryover = analyzeCarryover(carryoverMisses);
  const avgAntiPop = numbers.reduce(
    (sum, n) => sum + (normAntiPop.get(n) || 0),
    0,
  ) / 6;

  // Profile Match 점수
  const profile = buildWinningProfile(draws);
  const profileMatchScore = scoreCombinationProfile(numbers, profile);

  const strategy: StrategyInfo = {
    algorithmVersion: ALGORITHM_VERSION,
    factorSummary: '7-Model Ensemble(RRF+QIF) + Genetic Algorithm',
    antiPopularityScore: Math.round(avgAntiPop * 100) / 100,
    expectedValue: carryover.expectedValue,
    recommendation: carryover.recommendation,
    confidenceScore: Math.round(carryover.confidenceScore * 100) / 100,
    carryoverMisses,
    estimatedJackpot: formatKoreanWon(carryover.estimatedJackpot),
    poolSize: poolResult.poolSize,
    modelAgreement: Math.round(poolResult.modelAgreement * 100) / 100,
    profileMatchScore: Math.round(profileMatchScore * 100) / 100,
    partialMatchEV: poolResult.partialMatchEV,
    optimalPoolSize: poolResult.optimalPoolSize,
  };

  return { numbers, strategy };
}

// ─── Phase 2 Fallback: 풀 내 점수 계산 ─────────────────────────

interface PoolNumberScore {
  number: number;
  score: number;
}

/**
 * Fallback Phase 2 점수 = Anti-Popularity(50%) + Pair Correlation(30%) + Temporal(20%)
 */
function buildPoolScores(
  pool: number[],
  normAntiPop: Map<number, number>,
  normPair: Map<number, number>,
  now: Date,
  rng: () => number,
): PoolNumberScore[] {
  return pool.map(n => {
    const antiPop = normAntiPop.get(n) || 0;
    const pair = normPair.get(n) || 0;

    // 시간 엔트로피 (매 생성마다 다른 결과)
    const hourResonance = Math.cos((n * now.getHours() * Math.PI) / 45) * 0.15;
    const minuteResonance = Math.sin((n * now.getMinutes() * Math.PI) / 90) * 0.1;
    const noise = (rng() - 0.5) * 0.3;
    const temporal = (hourResonance + minuteResonance + noise + 0.5); // shift to ~0-1

    const score = antiPop * 0.50 + pair * 0.30 + temporal * 0.20;
    return { number: n, score };
  });
}

// ─── Phase 2 Fallback: 풀 내 선택 + 풀 확장 폴백 ───────────────

const TEMPERATURE = 1.5;

function selectFromPool(
  poolScored: PoolNumberScore[],
  originalPool: number[],
  draws: LottoDrawResult[],
  poolSize: number,
  recentNumbers: Set<number>,
): { numbers: number[]; usedPoolSize: number } {
  const seed = createTimeSeed();
  const rng = mulberry32(seed);

  let currentScored = [...poolScored];
  let usedPoolSize = poolSize;

  for (let attempt = 0; attempt < 1000; attempt++) {
    // 풀 확장 폴백
    if (attempt === 500 && usedPoolSize < 22) {
      currentScored = expandPool(currentScored, draws, 22, rng);
      usedPoolSize = 22;
    } else if (attempt === 750 && usedPoolSize < 27) {
      currentScored = expandPool(currentScored, draws, 27, rng);
      usedPoolSize = 27;
    }

    const selected = temperatureSample(currentScored, rng, TEMPERATURE);

    if (
      validateConstraints(selected) &&
      validateCombinationAntiPopularity(selected) &&
      validateRecentCollision(selected, recentNumbers)
    ) {
      return { numbers: selected.sort((a, b) => a - b), usedPoolSize };
    }
  }

  // 최종 폴백: 구간 보장
  const numbers = zoneFallback(currentScored, rng);
  return { numbers, usedPoolSize };
}

/**
 * 풀 확장: 기존 풀 + 45개 중 나머지에서 추가
 */
function expandPool(
  currentScored: PoolNumberScore[],
  draws: LottoDrawResult[],
  targetSize: number,
  rng: () => number,
): PoolNumberScore[] {
  const inPool = new Set(currentScored.map(s => s.number));
  const antiPopScores = calculateAntiPopularity(draws);
  const normAntiPop = normalizeScores(antiPopScores);

  const additional: PoolNumberScore[] = [];
  for (let i = 1; i <= 45; i++) {
    if (inPool.has(i)) continue;
    additional.push({
      number: i,
      score: (normAntiPop.get(i) || 0) * 0.7 + rng() * 0.3,
    });
  }
  additional.sort((a, b) => b.score - a.score);

  const needed = targetSize - currentScored.length;
  return [...currentScored, ...additional.slice(0, needed)];
}

// ─── Temperature 기반 가중 샘플링 ────────────────────────────────

function temperatureSample(
  scored: PoolNumberScore[],
  rng: () => number,
  temperature: number,
): number[] {
  const selected: number[] = [];
  const remaining = [...scored];

  for (let pick = 0; pick < 6; pick++) {
    const minScore = Math.min(...remaining.map(s => s.score));
    const scaled = remaining.map(s =>
      Math.pow(s.score - minScore + 0.01, 1 / temperature)
    );
    const totalWeight = scaled.reduce((sum, w) => sum + w, 0);

    let r = rng() * totalWeight;
    let chosenIdx = 0;
    for (let i = 0; i < scaled.length; i++) {
      r -= scaled[i];
      if (r <= 0) {
        chosenIdx = i;
        break;
      }
    }

    selected.push(remaining[chosenIdx].number);
    remaining.splice(chosenIdx, 1);
  }

  return selected;
}

// ─── 구간 보장 폴백 ─────────────────────────────────────────────

function zoneFallback(scored: PoolNumberScore[], rng: () => number): number[] {
  const zones: PoolNumberScore[][] = [[], [], [], [], []];
  for (const s of scored) {
    const zone = s.number >= 40 ? 4 : Math.floor((s.number - 1) / 10);
    zones[zone].push(s);
  }
  for (const zone of zones) {
    zone.sort((a, b) => b.score - a.score);
  }

  const selected: number[] = [];
  const used = new Set<number>();

  const lowPool = [...zones[0], ...zones[1], ...zones[2].filter(s => s.number <= 22)];
  const highPool = [...zones[2].filter(s => s.number >= 23), ...zones[3], ...zones[4]];
  lowPool.sort((a, b) => b.score - a.score);
  highPool.sort((a, b) => b.score - a.score);

  for (const s of lowPool) {
    if (selected.length >= 2) break;
    selected.push(s.number);
    used.add(s.number);
  }

  const high32 = highPool.filter(s => s.number >= 32);
  if (high32.length > 0) {
    selected.push(high32[0].number);
    used.add(high32[0].number);
  }
  for (const s of highPool) {
    if (selected.length >= 4) break;
    if (used.has(s.number)) continue;
    selected.push(s.number);
    used.add(s.number);
  }

  const rest = scored.filter(s => !used.has(s.number));
  rest.sort((a, b) => b.score - a.score);
  for (const s of rest) {
    if (selected.length >= 6) break;
    selected.push(s.number);
  }

  return selected.sort((a, b) => a - b);
}

// ─── 제약조건: 개별 번호 수준 ────────────────────────────────────

function validateConstraints(numbers: number[]): boolean {
  const sum = numbers.reduce((a, b) => a + b, 0);
  if (sum < 100 || sum > 175) return false;

  const oddCount = numbers.filter(n => n % 2 === 1).length;
  if (oddCount < 2 || oddCount > 4) return false;

  const lowCount = numbers.filter(n => n <= 22).length;
  if (lowCount < 2 || lowCount > 4) return false;

  const colorGroups = new Set(numbers.map(n => getBallColorGroup(n)));
  if (colorGroups.size < 3) return false;

  if (numbers.filter(n => n >= 32).length < 1) return false;

  const lastDigits = new Set(numbers.map(n => n % 10));
  if (lastDigits.size < 4) return false;

  return true;
}

// ─── 제약조건: 조합 수준 인기 패턴 차단 ─────────────────────────

function validateCombinationAntiPopularity(numbers: number[]): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);

  // (1) 등차수열 차단
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    diffs.push(sorted[i] - sorted[i - 1]);
  }
  if (diffs.every(d => d === diffs[0])) return false;

  // (2) 동일 10단위대 4개 이상 차단
  const decades = new Map<number, number>();
  for (const n of sorted) {
    const dec = Math.floor((n - 1) / 10);
    decades.set(dec, (decades.get(dec) || 0) + 1);
  }
  for (const count of decades.values()) {
    if (count >= 4) return false;
  }

  // (3) 3개 이상 연속번호 차단
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

// ─── 제약조건: 최근 당첨번호 충돌 검사 ──────────────────────────

/**
 * 최근 2회 당첨번호와 4개 이상 겹치면 차단
 */
function validateRecentCollision(
  numbers: number[],
  recentNumbers: Set<number>,
): boolean {
  const overlap = numbers.filter(n => recentNumbers.has(n)).length;
  return overlap < 4;
}

// ─── 유틸 ────────────────────────────────────────────────────────

function formatKoreanWon(amount: number): string {
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
