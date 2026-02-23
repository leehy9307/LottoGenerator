/**
 * Quantum-Inspired Interference Scoring
 *
 * 7개 모델 점수를 복소 진폭으로 변환:
 * - 합의 시 보강간섭(constructive) → 점수 증폭
 * - 불일치 시 상쇄간섭(destructive) → 점수 감쇠
 *
 * hybridFusion: 0.6 x RRF + 0.4 x Interference 블렌드
 */

interface ModelScore {
  name: string;
  scores: Map<number, number>;
}

/**
 * 7개 모델 점수를 복소 진폭으로 변환 후 간섭 패턴 생성
 *
 * 각 모델의 정규화된 점수를 진폭, 모델 인덱스에 따른 위상각으로 변환
 * 복소 진폭의 합 → |Ψ|^2 = 관측 확률 (Born rule)
 *
 * 합의(모든 모델이 높은 점수) → 보강간섭 → 높은 확률
 * 불일치(모델 간 점수 분산 큼) → 상쇄간섭 → 낮은 확률
 */
export function quantumInterferenceScore(modelResults: ModelScore[]): Map<number, number> {
  const numModels = modelResults.length;
  const interferenceScores = new Map<number, number>();

  // 각 모델별 점수를 0~1로 정규화
  const normalizedModels: Map<number, number>[] = modelResults.map(model => {
    const values = Array.from(model.scores.values());
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const normalized = new Map<number, number>();
    for (const [num, score] of model.scores) {
      normalized.set(num, (score - min) / range);
    }
    return normalized;
  });

  for (let num = 1; num <= 45; num++) {
    // 각 모델의 점수를 복소 진폭으로 변환
    let realSum = 0;
    let imagSum = 0;

    for (let m = 0; m < numModels; m++) {
      const amplitude = normalizedModels[m].get(num) || 0;
      // 위상각: 모델마다 다른 각도로 분산 (균등 배치)
      const phase = (2 * Math.PI * m) / numModels;

      // 복소 진폭 = amplitude * e^(i*phase)
      // 핵심: amplitude가 높은 모델이 많을수록 보강간섭
      realSum += amplitude * Math.cos(phase);
      imagSum += amplitude * Math.sin(phase);
    }

    // Born rule: 확률 = |Ψ|^2
    const probability = (realSum * realSum + imagSum * imagSum) / (numModels * numModels);
    interferenceScores.set(num, probability);
  }

  return interferenceScores;
}

/**
 * RRF 점수와 Quantum Interference 점수를 블렌드
 *
 * hybrid = 0.6 x RRF(정규화) + 0.4 x Interference(정규화)
 *
 * RRF: 순위 기반 안정적 앙상블
 * Interference: 비선형 합의 증폭 (모델 일치도에 민감)
 */
export function hybridFusion(
  rrfScores: Map<number, number>,
  interferenceScores: Map<number, number>,
): Map<number, number> {
  // 각각 정규화
  const normRRF = normalizeMap(rrfScores);
  const normInterference = normalizeMap(interferenceScores);

  const hybrid = new Map<number, number>();
  for (let num = 1; num <= 45; num++) {
    const rrf = normRRF.get(num) || 0;
    const interference = normInterference.get(num) || 0;
    hybrid.set(num, rrf * 0.6 + interference * 0.4);
  }

  return hybrid;
}

function normalizeMap(scores: Map<number, number>): Map<number, number> {
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
