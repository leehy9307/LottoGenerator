/**
 * hybridPipeline.ts — 하이브리드 분석 파이프라인 오케스트레이터
 * NIST → PRNG 탐지 → ML 예측 → 기존 패턴 엔진 → 적응적 융합
 * v11.0
 */

import {
  LottoDrawResult,
  MLPredictionData,
  HybridWeights,
  HybridPipelineResult,
} from '../types/lotto';
import { runNistSuite, NistSuiteResult } from './nistTests';
import { runPRNGDetection, PRNGDetectionResult } from './prngDetector';
import {
  fetchMLPredictions,
  isMLPredictionFresh,
} from './mlPredictionLoader';

// ============================================================
// 적응적 가중치 계산
// ============================================================

/**
 * NIST 결과와 PRNG 탐지 결과에 따라 융합 가중치를 결정
 *
 * | 상황             | PRNG수학 | ML    | 패턴  | 구조  |
 * |------------------|----------|-------|-------|-------|
 * | PRNG 탐지됨      | 0.70     | 0.15  | 0.10  | 0.05  |
 * | 비무작위 (미특정) | 0.00     | 0.35  | 0.35  | 0.30  |
 * | 완전 무작위      | 0.00     | 0.15  | 0.25  | 0.60  |
 */
function computeHybridWeights(
  nist: NistSuiteResult,
  prng: PRNGDetectionResult
): HybridWeights {
  if (prng.predictable) {
    // PRNG이 탐지되어 수학적 예측이 가능한 경우
    return { prngMath: 0.70, ml: 0.15, pattern: 0.10, structural: 0.05 };
  }

  if (nist.verdict === 'non-random' || nist.verdict === 'suspicious') {
    // 비무작위이지만 특정 PRNG을 식별하지 못한 경우
    return { prngMath: 0.0, ml: 0.35, pattern: 0.35, structural: 0.30 };
  }

  // 완전 무작위 — 예측 불가, 구조 적합도 + EV 최적화 중심
  return { prngMath: 0.0, ml: 0.15, pattern: 0.25, structural: 0.60 };
}

// ============================================================
// 번호별 융합 점수 계산
// ============================================================

/**
 * 각 소스의 번호별 점수를 가중 융합
 * 결과: 1~45 번호별 0~1 스코어
 */
function fuseNumberScores(
  weights: HybridWeights,
  prng: PRNGDetectionResult,
  ml: MLPredictionData | null,
  draws: LottoDrawResult[]
): Record<number, number> {
  const scores: Record<number, number> = {};

  for (let n = 1; n <= 45; n++) {
    let score = 0;

    // 1) PRNG 수학적 예측 점수
    if (weights.prngMath > 0 && prng.nextPrediction) {
      score += weights.prngMath * (prng.nextPrediction.includes(n) ? 1.0 : 0.0);
    }

    // 2) ML 앙상블 예측 확률
    if (weights.ml > 0 && ml) {
      const prob = ml.predictions.ensemble.probabilities[n - 1] || 0;
      // 정규화: 기본 확률 6/45 = 0.133 기준 상대 점수
      score += weights.ml * Math.min(prob / 0.2, 1.0);
    }

    // 3) 패턴 엔진 점수 (최근 출현 빈도 기반 간이 계산)
    if (weights.pattern > 0) {
      const recentDraws = draws.slice(-20);
      let recentCount = 0;
      for (const d of recentDraws) {
        if (d.numbers.includes(n)) recentCount++;
      }
      const recentFreq = recentCount / recentDraws.length;
      // 적정 빈도(6/45 ≈ 0.133) 근처가 최적
      const deviation = Math.abs(recentFreq - 6 / 45);
      score += weights.pattern * Math.max(0, 1 - deviation * 5);
    }

    // 4) 구조 적합도 (균등 분포 기반)
    if (weights.structural > 0) {
      // 구조 적합도는 조합 레벨이므로 번호 레벨에서는 균등 분배
      score += weights.structural * (6 / 45);
    }

    scores[n] = Math.round(score * 1000) / 1000;
  }

  return scores;
}

// ============================================================
// 종합 판정 메시지 생성
// ============================================================

function generateVerdict(
  nist: NistSuiteResult,
  prng: PRNGDetectionResult,
  ml: MLPredictionData | null
): string {
  const parts: string[] = [];

  // NIST 판정
  if (nist.verdict === 'random') {
    parts.push(`NIST 9개 테스트 중 ${nist.passedCount}개 통과 — 통계적으로 무작위`);
  } else if (nist.verdict === 'suspicious') {
    parts.push(
      `NIST 테스트 ${nist.passedCount}/${nist.totalTests} 통과 — 일부 패턴 의심`
    );
  } else {
    parts.push(
      `NIST 테스트 ${nist.passedCount}/${nist.totalTests} 통과 — 비무작위 구조 감지`
    );
  }

  // PRNG 탐지
  if (prng.predictable) {
    parts.push(
      `PRNG 탐지: ${prng.verdict} (신뢰도 ${(prng.confidence * 100).toFixed(0)}%) — 수학적 예측 활성화`
    );
  } else if (prng.verdict !== 'none_detected') {
    parts.push(`약한 구조 감지: ${prng.verdict} (확정적 예측 불가)`);
  }

  // ML 예측
  if (ml) {
    const conf = ml.predictions.ensemble.confidence;
    parts.push(
      `ML 앙상블 신뢰도: ${(conf * 100).toFixed(0)}% (기준 회차: ${ml.basedOnDraw}회)`
    );
  } else {
    parts.push('ML 예측: 사용 불가 (오프라인)');
  }

  return parts.join(' | ');
}

// ============================================================
// 메인 파이프라인
// ============================================================

/**
 * 하이브리드 분석 파이프라인 실행
 * 비동기: ML 예측 fetch가 포함됨
 *
 * 초기 렌더에 영향 없이, 기존 동기 분석 후 비동기로 실행
 */
export async function runHybridPipeline(
  draws: LottoDrawResult[],
  currentDrawNo: number
): Promise<HybridPipelineResult> {
  // ── Stage 1: NIST 난수성 평가 ──
  const nistResult = runNistSuite(draws);

  // ── Stage 2: PRNG 탐지 ──
  const prngResult = runPRNGDetection(draws);

  // ── Stage 3: ML 예측 로드 ──
  let mlPredictions: MLPredictionData | null = null;
  try {
    const raw = await fetchMLPredictions();
    if (raw && isMLPredictionFresh(raw, currentDrawNo)) {
      mlPredictions = raw;
    }
  } catch {
    // ML 예측 로드 실패 — 무시하고 계속
  }

  // ── Stage 4: 적응적 가중치 결정 ──
  const fusionWeights = computeHybridWeights(nistResult, prngResult);

  // ── Stage 5: 번호별 융합 점수 ──
  const numberScores = fuseNumberScores(
    fusionWeights,
    prngResult,
    mlPredictions,
    draws
  );

  // ── 종합 판정 ──
  const pipelineVerdict = generateVerdict(nistResult, prngResult, mlPredictions);

  let randomnessClassification: HybridPipelineResult['randomnessClassification'];
  if (prngResult.predictable) {
    randomnessClassification = 'prng_detected';
  } else if (
    nistResult.verdict === 'suspicious' ||
    nistResult.verdict === 'non-random'
  ) {
    randomnessClassification = 'weakly_structured';
  } else {
    randomnessClassification = 'truly_random';
  }

  return {
    nistResult,
    prngResult,
    mlPredictions,
    fusionWeights,
    numberScores,
    pipelineVerdict,
    randomnessClassification,
  };
}
