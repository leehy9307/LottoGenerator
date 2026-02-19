import { LottoDrawResult } from '../types/lotto';
import { calculateFrequencies } from './frequencyAnalysis';
import {
  recencyWeightedFrequency,
  calculateMomentum,
  calculateGaps,
  normalizeScores,
} from './trendAnalysis';
import { getBallColorGroup } from '../constants/ballColors';

interface WeightedScore {
  number: number;
  score: number;
  components: {
    frequency: number;
    recency: number;
    momentum: number;
    gap: number;
    temporal: number;
  };
}

/**
 * Mulberry32: 고품질 32-bit 시드 기반 PRNG
 * Math.random()보다 결정적이고 재현 가능한 난수 생성
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 현재 시각에서 시간 엔트로피 시드 생성
 * 밀리초 + 분 + 초를 조합하여 매 호출마다 다른 시드
 */
function createTimeSeed(): number {
  const now = Date.now();
  const d = new Date();
  // 여러 시간 성분을 XOR 조합
  return (now ^ (d.getMilliseconds() * 65537)
    ^ (d.getSeconds() * 2147483647)
    ^ (d.getMinutes() * 16777259)) >>> 0;
}

/**
 * 시간 주기성 기반 가중치 계산
 * - 요일별 패턴: 토요일(추첨일) 가까울수록 가중치 변화
 * - 시간대별 미세 변동: 같은 날이라도 시간대마다 다른 추천
 */
function temporalWeights(now: Date): Map<number, number> {
  const weights = new Map<number, number>();
  const seed = createTimeSeed();
  const rng = mulberry32(seed);

  // 요일 (0=일~6=토), 시간, 분을 조합
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // 다음 추첨까지 남은 일수 (토요일까지)
  const daysToSaturday = (6 - dayOfWeek + 7) % 7 || 7;
  const urgencyFactor = 1 - (daysToSaturday / 7) * 0.3; // 토요일에 가까울수록 높음

  for (let i = 1; i <= 45; i++) {
    // 번호별 시간 공명 점수: 시간 성분과 번호의 수학적 관계
    const hourResonance = Math.cos((i * hour * Math.PI) / 45) * 0.15;
    const minuteResonance = Math.sin((i * minute * Math.PI) / 90) * 0.1;
    const dayResonance = Math.cos((i * dayOfWeek * Math.PI) / 7) * 0.1;

    // PRNG 기반 탐색 잡음 (매 호출마다 달라짐)
    const noise = (rng() - 0.5) * 0.3;

    const weight = (hourResonance + minuteResonance + dayResonance + noise) * urgencyFactor;
    weights.set(i, weight);
  }

  return weights;
}

/**
 * Expert Pick: 시간 엔트로피 강화 복합 가중치 알고리즘
 *
 * 5개 요소의 정규화 점수를 가중 합산:
 * - 출현 빈도 (20%): 절대적 출현 횟수
 * - 최근성 가중 빈도 (20%): 지수 감쇠 기반 최근 출현 강조
 * - 모멘텀 (20%): 최근 vs 이전 구간의 출현률 변화
 * - 갭 분석 (15%): 오래 안 나온 번호에 보너스
 * - 시간 엔트로피 (25%): 현재 시각 기반 동적 가중치
 *
 * 분포 제약조건으로 최종 필터링:
 * - 합계 100~175 | 홀짝 최소 2:4 | 고저 균형 | 3색상 이상
 */
export function generateExpertPick(draws: LottoDrawResult[], timestamp?: number): number[] {
  const now = timestamp ? new Date(timestamp) : new Date();

  const frequencies = calculateFrequencies(draws);
  const recencyScores = recencyWeightedFrequency(draws);
  const momentumScores = calculateMomentum(draws);
  const gapScores = calculateGaps(draws);
  const timeScores = temporalWeights(now);

  // 정규화
  const freqMap = new Map<number, number>();
  for (const f of frequencies) {
    freqMap.set(f.number, f.count);
  }
  const normFreq = normalizeScores(freqMap);
  const normRecency = normalizeScores(recencyScores);
  const normMomentum = normalizeScores(momentumScores);
  const normGap = normalizeScores(gapScores);
  const normTime = normalizeScores(timeScores);

  // 복합 점수 계산
  const scored: WeightedScore[] = [];
  for (let i = 1; i <= 45; i++) {
    const freqScore = normFreq.get(i) || 0;
    const recScore = normRecency.get(i) || 0;
    const momScore = normMomentum.get(i) || 0;
    const gapScore = normGap.get(i) || 0;
    const timeScore = normTime.get(i) || 0;

    const composite =
      freqScore * 0.20 +
      recScore * 0.20 +
      momScore * 0.20 +
      gapScore * 0.15 +
      timeScore * 0.25;

    scored.push({
      number: i,
      score: composite,
      components: {
        frequency: freqScore,
        recency: recScore,
        momentum: momScore,
        gap: gapScore,
        temporal: timeScore,
      },
    });
  }

  scored.sort((a, b) => b.score - a.score);

  return selectWithConstraints(scored, now);
}

function selectWithConstraints(scored: WeightedScore[], now: Date): number[] {
  const seed = createTimeSeed();
  const rng = mulberry32(seed);
  const maxAttempts = 200;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const selected = greedySelect(scored, attempt, rng);
    if (selected && validateConstraints(selected)) {
      return selected.sort((a, b) => a - b);
    }
  }

  return scored
    .slice(0, 6)
    .map(s => s.number)
    .sort((a, b) => a - b);
}

function greedySelect(
  scored: WeightedScore[],
  attempt: number,
  rng: () => number
): number[] | null {
  const selected: number[] = [];
  const candidates = [...scored];

  if (attempt > 0) {
    for (let i = 0; i < candidates.length; i++) {
      const jitter = (rng() - 0.5) * 0.12 * Math.min(attempt / 10, 1);
      candidates[i] = { ...candidates[i], score: candidates[i].score + jitter };
    }
    candidates.sort((a, b) => b.score - a.score);
  }

  for (const candidate of candidates) {
    if (selected.length >= 6) break;

    const testSet = [...selected, candidate.number];
    if (testSet.length === 6) {
      if (validateConstraints(testSet)) {
        selected.push(candidate.number);
      }
    } else {
      selected.push(candidate.number);
    }
  }

  return selected.length === 6 ? selected : null;
}

function validateConstraints(numbers: number[]): boolean {
  const sum = numbers.reduce((a, b) => a + b, 0);
  if (sum < 100 || sum > 175) return false;

  const oddCount = numbers.filter(n => n % 2 === 1).length;
  const evenCount = 6 - oddCount;
  if (oddCount < 2 || evenCount < 2) return false;

  const lowCount = numbers.filter(n => n <= 22).length;
  const highCount = 6 - lowCount;
  if (lowCount < 2 || highCount < 2) return false;

  const colorGroups = new Set(numbers.map(n => getBallColorGroup(n)));
  if (colorGroups.size < 3) return false;

  return true;
}
