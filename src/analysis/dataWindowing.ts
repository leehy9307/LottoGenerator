import { LottoDrawResult } from '../types/lotto';

/**
 * Smart Data Windowing v8.0 — AI 기반 다중 시간 척도 데이터 선택 엔진
 *
 * 핵심 철학: "모든 데이터를 동등하게 쓰지 마라. 목적에 맞는 데이터만 써라."
 *
 * 문제점 (v7.x):
 *   - 200회차를 모든 분석에 동일 가중치로 사용
 *   - Bayesian posterior가 과도하게 타이트해져 최근 변화 반영 불가
 *   - 추첨기 교체, 플레이어 행동 변화 등 레짐 전환 무시
 *
 * 해결:
 *   [1] 지수 시간 감쇠 (Exponential Decay Weighting)
 *       — 최근 회차일수록 높은 가중치, 오래된 회차는 자연스럽게 감쇠
 *   [2] 다중 시간 척도 (Multi-Scale Windows)
 *       — 단기(20회)/중기(60회)/장기(150회)를 분석 목적별로 분리
 *   [3] 레짐 감지 (Regime Detection)
 *       — 통계적 변화점(Change Point)을 감지해 현재 레짐만 사용
 *   [4] 적응형 윈도우 (Adaptive Window)
 *       — 데이터 특성에 따라 최적 윈도우 크기 자동 결정
 */

// ─── 가중 데이터 타입 ───────────────────────────────────────────

export interface WeightedDraw {
  draw: LottoDrawResult;
  weight: number;       // 0~1, 시간 감쇠 가중치
  recencyRank: number;  // 0 = 가장 최근, N-1 = 가장 오래됨
}

export interface MultiScaleData {
  /** 단기 (최근 20회) — 현재 트렌드 감지, recency bias 모델링 */
  short: WeightedDraw[];
  /** 중기 (최근 60회) — 구조 프로파일, 안정적 패턴 */
  medium: WeightedDraw[];
  /** 장기 (전체) — 기저 통계, chi-square 검정용 */
  long: WeightedDraw[];
  /** 레짐 감지 결과: 현재 레짐 시작점 */
  regimeStart: number;
  /** 적응형 최적 윈도우 크기 */
  optimalWindow: number;
  /** 원본 전체 데이터 */
  allDraws: LottoDrawResult[];
}

// ─── 설정 ────────────────────────────────────────────────────────

const SHORT_WINDOW = 20;
const MEDIUM_WINDOW = 60;

// 지수 감쇠 반감기 (회차 단위)
const HALF_LIFE_SHORT = 8;    // 단기: 8회차 반감기 → 매우 빠르게 감쇠
const HALF_LIFE_MEDIUM = 25;  // 중기: 25회차 반감기
const HALF_LIFE_LONG = 80;    // 장기: 80회차 반감기 → 천천히 감쇠

// ─── 메인 함수 ───────────────────────────────────────────────────

/**
 * 전체 회차 데이터를 받아 다중 시간 척도 가중 데이터를 생성한다.
 */
export function buildMultiScaleData(draws: LottoDrawResult[]): MultiScaleData {
  // 최신순 정렬
  const sorted = [...draws].sort((a, b) => b.drawNo - a.drawNo);

  // 레짐 감지: 통계적 변화점 찾기
  const regimeStart = detectRegimeChange(sorted);

  // 적응형 윈도우: 현재 레짐 내에서 최적 크기
  const optimalWindow = computeOptimalWindow(sorted, regimeStart);

  // 각 시간 척도별 가중 데이터 생성
  const shortSlice = sorted.slice(0, Math.min(SHORT_WINDOW, sorted.length));
  const mediumSlice = sorted.slice(0, Math.min(MEDIUM_WINDOW, sorted.length));

  const short = applyDecayWeights(shortSlice, HALF_LIFE_SHORT);
  const medium = applyDecayWeights(mediumSlice, HALF_LIFE_MEDIUM);
  const long = applyDecayWeights(sorted, HALF_LIFE_LONG);

  return {
    short,
    medium,
    long,
    regimeStart,
    optimalWindow,
    allDraws: draws,
  };
}

// ─── 지수 시간 감쇠 가중치 ──────────────────────────────────────

/**
 * 지수 감쇠: w(i) = exp(-ln(2) * i / halfLife)
 * i=0 → 1.0, i=halfLife → 0.5, i=2*halfLife → 0.25 ...
 *
 * 정규화: 합이 1이 되도록 (가중 평균 계산 용이)
 */
function applyDecayWeights(
  draws: LottoDrawResult[],   // 최신순 정렬 가정
  halfLife: number,
): WeightedDraw[] {
  const ln2 = Math.LN2;
  const rawWeights: number[] = [];

  for (let i = 0; i < draws.length; i++) {
    rawWeights.push(Math.exp(-ln2 * i / halfLife));
  }

  // 정규화
  const sum = rawWeights.reduce((a, b) => a + b, 0);

  return draws.map((draw, i) => ({
    draw,
    weight: rawWeights[i] / sum,
    recencyRank: i,
  }));
}

// ─── 레짐 감지 (Change Point Detection) ─────────────────────────

/**
 * CUSUM (Cumulative Sum) 기반 레짐 변화점 감지.
 *
 * 각 회차의 번호 합계를 기준으로, 최근 데이터에서 통계적으로
 * 유의미한 변화가 발생한 지점을 찾는다.
 *
 * 반환: 현재 레짐이 시작된 회차의 인덱스 (최신순 기준)
 */
function detectRegimeChange(sortedDraws: LottoDrawResult[]): number {
  if (sortedDraws.length < 30) return sortedDraws.length;

  // 번호 합계 시계열 (최신→과거)
  const sums = sortedDraws.map(d => d.numbers.reduce((a, b) => a + b, 0));

  // 전체 평균/표준편차
  const globalMean = sums.reduce((a, b) => a + b, 0) / sums.length;
  const globalStd = Math.sqrt(
    sums.reduce((s, x) => s + (x - globalMean) ** 2, 0) / sums.length
  );

  if (globalStd < 1) return sortedDraws.length;

  // CUSUM: 누적 편차 → 최대 편차 지점 = 변화점 후보
  let cumSum = 0;
  let maxAbsCusum = 0;
  let changePoint = sortedDraws.length;

  for (let i = 0; i < Math.min(sums.length, 150); i++) {
    cumSum += (sums[i] - globalMean) / globalStd;
    const absCusum = Math.abs(cumSum);

    if (absCusum > maxAbsCusum) {
      maxAbsCusum = absCusum;
      changePoint = i + 1;
    }
  }

  // 유의성 검정: CUSUM이 충분히 크지 않으면 레짐 변화 없다고 판단
  // 임계값: sqrt(N) * 1.5 (보수적)
  const threshold = Math.sqrt(Math.min(sums.length, 150)) * 1.5;

  if (maxAbsCusum < threshold) {
    // 레짐 변화 없음 → 전체 사용 가능하지만, 최대 100회로 제한
    return Math.min(sortedDraws.length, 100);
  }

  // 변화점이 너무 짧으면 최소 30회 보장
  return Math.max(changePoint, 30);
}

// ─── 적응형 윈도우 크기 결정 ────────────────────────────────────

/**
 * 현재 레짐 내에서 최적 윈도우 크기를 결정한다.
 *
 * 기준: 번호별 출현 빈도의 안정성 (변동계수 CV)
 * - CV가 충분히 낮아질 때까지 윈도우를 키움
 * - 하지만 레짐 경계를 넘지 않음
 *
 * 최소 30회, 최대 regimeStart 범위 내.
 */
function computeOptimalWindow(
  sortedDraws: LottoDrawResult[],
  regimeStart: number,
): number {
  const maxWindow = Math.min(regimeStart, sortedDraws.length);

  if (maxWindow < 30) return maxWindow;

  // 30회부터 시작해서 5회씩 키우며 CV 안정성 체크
  let bestWindow = 30;
  let prevCV = Infinity;
  const CV_STABILITY_THRESHOLD = 0.02; // CV 변화가 2% 미만이면 안정

  for (let w = 30; w <= maxWindow; w += 5) {
    const slice = sortedDraws.slice(0, w);
    const cv = computeFrequencyCV(slice);

    // CV가 안정화되면 (변화량이 임계값 미만) 해당 윈도우 채택
    if (prevCV !== Infinity && Math.abs(cv - prevCV) < CV_STABILITY_THRESHOLD) {
      bestWindow = w;
      break;
    }

    prevCV = cv;
    bestWindow = w;
  }

  return bestWindow;
}

/**
 * 45개 번호의 출현 빈도 변동계수 (CV = std/mean)
 * CV가 낮을수록 = 빈도 분포가 균일 = 충분한 데이터
 */
function computeFrequencyCV(draws: LottoDrawResult[]): number {
  const counts = new Array(45).fill(0);
  for (const d of draws) {
    for (const n of d.numbers) {
      counts[n - 1]++;
    }
  }

  const mean = counts.reduce((a: number, b: number) => a + b, 0) / 45;
  if (mean < 0.001) return Infinity;

  const variance = counts.reduce((s: number, c: number) => s + (c - mean) ** 2, 0) / 45;
  return Math.sqrt(variance) / mean;
}

// ─── 유틸리티: 가중 데이터에서 원본 추출 ────────────────────────

/** WeightedDraw[] → LottoDrawResult[] (가중치 순 정렬 유지) */
export function extractDraws(weighted: WeightedDraw[]): LottoDrawResult[] {
  return weighted.map(w => w.draw);
}

/** 가중 평균 계산 헬퍼 */
export function weightedMean(
  weighted: WeightedDraw[],
  valueFn: (draw: LottoDrawResult) => number,
): number {
  let sum = 0;
  let wSum = 0;
  for (const { draw, weight } of weighted) {
    sum += valueFn(draw) * weight;
    wSum += weight;
  }
  return wSum > 0 ? sum / wSum : 0;
}

/** 가중 분산 계산 헬퍼 */
export function weightedVariance(
  weighted: WeightedDraw[],
  valueFn: (draw: LottoDrawResult) => number,
): number {
  const mean = weightedMean(weighted, valueFn);
  let sum = 0;
  let wSum = 0;
  for (const { draw, weight } of weighted) {
    const diff = valueFn(draw) - mean;
    sum += weight * diff * diff;
    wSum += weight;
  }
  return wSum > 0 ? sum / wSum : 0;
}
