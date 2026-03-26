/**
 * mlPredictionLoader.ts — ML 모델 예측 데이터 로더
 * Python ML 파이프라인이 생성한 predictions.json을 앱에서 소비
 * v11.0
 */

import { MLPredictionData, MLModelPrediction } from '../types/lotto';

// ML 예측 JSON의 원격 URL (GitHub Raw 등에 호스팅)
const ML_PREDICTIONS_URL =
  'https://raw.githubusercontent.com/your-repo/lotto-ml/main/outputs/predictions.json';

// 번들 에셋 (빌드 시 포함, 오프라인 폴백)
let BUNDLED_PREDICTIONS: MLPredictionData | null = null;

/**
 * 번들 에셋 설정 (앱 초기화 시 호출)
 */
export function setBundledPredictions(data: MLPredictionData | null): void {
  BUNDLED_PREDICTIONS = data;
}

/**
 * ML 예측 데이터 가져오기
 * 우선순위: 원격 URL → 번들 에셋 → null
 */
export async function fetchMLPredictions(): Promise<MLPredictionData | null> {
  // 1) 원격 fetch 시도
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(ML_PREDICTIONS_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const raw = await res.json();
      const validated = validateMLPredictions(raw);
      if (validated) return validated;
    }
  } catch {
    // 네트워크 실패 → 번들 폴백
  }

  // 2) 번들 에셋
  if (BUNDLED_PREDICTIONS) {
    return BUNDLED_PREDICTIONS;
  }

  // 3) 사용 불가
  return null;
}

/**
 * ML 예측 데이터 스키마 검증
 */
export function validateMLPredictions(
  data: unknown
): MLPredictionData | null {
  if (!data || typeof data !== 'object') return null;

  const d = data as Record<string, unknown>;

  if (typeof d.model_version !== 'string') return null;
  if (typeof d.generated_at !== 'string') return null;
  if (typeof d.based_on_draw !== 'number') return null;
  if (!d.predictions || typeof d.predictions !== 'object') return null;

  const preds = d.predictions as Record<string, unknown>;

  const validateModel = (m: unknown): MLModelPrediction | null => {
    if (!m || typeof m !== 'object') return null;
    const model = m as Record<string, unknown>;
    if (!Array.isArray(model.probabilities) || model.probabilities.length !== 45)
      return null;
    if (!Array.isArray(model.top6) || model.top6.length !== 6) return null;
    if (typeof model.confidence !== 'number') return null;
    return {
      probabilities: model.probabilities as number[],
      top6: model.top6 as number[],
      confidence: model.confidence as number,
    };
  };

  const lstm = validateModel(preds.lstm);
  const transformer = validateModel(preds.transformer);
  const ensemble = validateModel(preds.ensemble);

  if (!lstm || !transformer || !ensemble) return null;

  return {
    modelVersion: d.model_version as string,
    generatedAt: d.generated_at as string,
    basedOnDraw: d.based_on_draw as number,
    predictions: { lstm, transformer, ensemble },
  };
}

/**
 * ML 예측이 현재 회차와 가까운지 확인
 * 3회차 이내면 "신선"으로 판정
 */
export function isMLPredictionFresh(
  prediction: MLPredictionData,
  currentDraw: number
): boolean {
  return Math.abs(currentDraw - prediction.basedOnDraw) <= 3;
}
