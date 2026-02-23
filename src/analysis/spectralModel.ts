import { LottoDrawResult } from '../types/lotto';

/**
 * Model F: Spectral Analysis — FFT 기반 주기성 탐지
 *
 * 각 번호(1~45)의 출현 시계열에 DFT(Discrete Fourier Transform) 적용
 * 주요 주파수의 위상(phase) 기반 점수 — 현재 시점이 출현 주기에 해당하면 고득점
 *
 * O(45 x N^2) — N=78일 때 ~5ms
 */

/**
 * 각 번호에 대해 출현 시계열을 구성하고 DFT를 적용하여
 * 현재 시점이 주기적 피크에 가까운 번호에 높은 점수를 부여
 */
export function spectralAnalysisScore(draws: LottoDrawResult[]): Map<number, number> {
  const sorted = [...draws].sort((a, b) => a.drawNo - b.drawNo);
  const N = sorted.length;
  const scores = new Map<number, number>();

  if (N < 10) {
    // 데이터 부족 시 균일 점수
    for (let i = 1; i <= 45; i++) scores.set(i, 1 / 45);
    return scores;
  }

  for (let num = 1; num <= 45; num++) {
    // 출현 시계열: 각 추첨에서 해당 번호가 나왔으면 1, 아니면 0
    const timeSeries: number[] = new Array(N);
    for (let t = 0; t < N; t++) {
      timeSeries[t] = sorted[t].numbers.includes(num) ? 1 : 0;
    }

    // 평균 제거 (DC 성분 제거)
    const mean = timeSeries.reduce((a, b) => a + b, 0) / N;
    for (let t = 0; t < N; t++) {
      timeSeries[t] -= mean;
    }

    // DFT: 상위 주파수 성분 분석 (주기 3~N/2)
    // 주파수 k의 주기 = N/k — 너무 짧은 주기(k > N/3)는 노이즈
    const maxK = Math.floor(N / 3);
    let bestAmplitude = 0;
    let bestPhase = 0;
    let bestK = 1;

    for (let k = 1; k <= maxK; k++) {
      // DFT at frequency k
      let realPart = 0;
      let imagPart = 0;
      for (let t = 0; t < N; t++) {
        const angle = (2 * Math.PI * k * t) / N;
        realPart += timeSeries[t] * Math.cos(angle);
        imagPart -= timeSeries[t] * Math.sin(angle);
      }

      const amplitude = Math.sqrt(realPart * realPart + imagPart * imagPart) / N;

      if (amplitude > bestAmplitude) {
        bestAmplitude = amplitude;
        bestPhase = Math.atan2(imagPart, realPart);
        bestK = k;
      }
    }

    // 현재 시점(t=N)에서의 위상 기반 점수
    // 피크 주기에 가까울수록 cos 값이 1에 가까움
    const currentPhaseAngle = (2 * Math.PI * bestK * N) / N + bestPhase;
    const phaseScore = (Math.cos(currentPhaseAngle) + 1) / 2; // 0~1 정규화

    // 최종 점수 = 진폭 가중 위상 점수
    // 진폭이 큰 주기가 더 신뢰할 수 있으므로 가중치 부여
    const score = bestAmplitude * phaseScore + mean; // 기저 출현율도 반영
    scores.set(num, score);
  }

  return scores;
}
