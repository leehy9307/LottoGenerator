"""
LSTM + Transformer 앙상블 모델
가중 평균 및 메타 학습기 기반 앙상블
"""

import numpy as np
import torch
from sklearn.linear_model import LogisticRegression
from itertools import product

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import BINARY_DIM, PICK_K


class LottoEnsemble:
    """
    LSTM과 Transformer 예측을 결합하는 앙상블 모델

    두 가지 앙상블 방법:
    1. 가중 평균 (그리드 서치로 최적 가중치 탐색)
    2. 메타 학습기 (LogisticRegression으로 stacking)
    """

    def __init__(self):
        self.lstm_weight = 0.5
        self.transformer_weight = 0.5
        self.meta_learner: LogisticRegression | None = None
        self.use_meta_learner = False

    def grid_search_weights(self,
                            lstm_probs: np.ndarray,
                            transformer_probs: np.ndarray,
                            targets: np.ndarray,
                            step: float = 0.05) -> tuple[float, float]:
        """
        검증 세트에서 최적 가중치를 그리드 서치로 탐색

        Args:
            lstm_probs: (N, 45) LSTM 확률 예측
            transformer_probs: (N, 45) Transformer 확률 예측
            targets: (N, 45) 실제 이진 벡터
            step: 그리드 탐색 간격

        Returns:
            (lstm_weight, transformer_weight)
        """
        best_score = -1.0
        best_w = 0.5

        weights = np.arange(0.0, 1.0 + step, step)

        for w in weights:
            # 가중 평균
            ensemble_probs = w * lstm_probs + (1.0 - w) * transformer_probs

            # top-6 precision으로 평가
            score = self._compute_top6_precision(ensemble_probs, targets)

            if score > best_score:
                best_score = score
                best_w = w

        self.lstm_weight = best_w
        self.transformer_weight = 1.0 - best_w

        print(f"최적 앙상블 가중치 — LSTM: {self.lstm_weight:.2f}, "
              f"Transformer: {self.transformer_weight:.2f} "
              f"(precision: {best_score:.4f})")

        return self.lstm_weight, self.transformer_weight

    def train_meta_learner(self,
                           lstm_probs: np.ndarray,
                           transformer_probs: np.ndarray,
                           targets: np.ndarray) -> None:
        """
        메타 학습기 (Logistic Regression) 학습

        Args:
            lstm_probs: (N, 45) LSTM 확률 예측
            transformer_probs: (N, 45) Transformer 확률 예측
            targets: (N, 45) 실제 이진 벡터
        """
        # 두 모델의 예측을 수평으로 결합 → (N*45, 2)
        n_samples = lstm_probs.shape[0]
        stacked_features = np.column_stack([
            lstm_probs.reshape(-1),
            transformer_probs.reshape(-1),
        ])
        stacked_targets = targets.reshape(-1)

        self.meta_learner = LogisticRegression(
            max_iter=1000,
            C=1.0,
            solver="lbfgs",
        )
        self.meta_learner.fit(stacked_features, stacked_targets)
        self.use_meta_learner = True

        # 메타 학습기 성능 확인
        meta_probs = self.meta_learner.predict_proba(stacked_features)[:, 1]
        meta_probs = meta_probs.reshape(n_samples, BINARY_DIM)
        score = self._compute_top6_precision(meta_probs, targets)
        print(f"메타 학습기 학습 완료 (precision: {score:.4f})")

    def predict(self,
                lstm_probs: np.ndarray,
                transformer_probs: np.ndarray) -> np.ndarray:
        """
        앙상블 예측

        Args:
            lstm_probs: (batch, 45) 또는 (45,) LSTM 확률
            transformer_probs: (batch, 45) 또는 (45,) Transformer 확률

        Returns:
            (batch, 45) 또는 (45,) 앙상블 확률
        """
        if self.use_meta_learner and self.meta_learner is not None:
            return self._predict_meta(lstm_probs, transformer_probs)
        return self._predict_weighted(lstm_probs, transformer_probs)

    def _predict_weighted(self,
                          lstm_probs: np.ndarray,
                          transformer_probs: np.ndarray) -> np.ndarray:
        """가중 평균 앙상블"""
        return (self.lstm_weight * lstm_probs +
                self.transformer_weight * transformer_probs)

    def _predict_meta(self,
                      lstm_probs: np.ndarray,
                      transformer_probs: np.ndarray) -> np.ndarray:
        """메타 학습기 앙상블"""
        original_shape = lstm_probs.shape
        is_1d = lstm_probs.ndim == 1

        if is_1d:
            lstm_probs = lstm_probs.reshape(1, -1)
            transformer_probs = transformer_probs.reshape(1, -1)

        n_samples = lstm_probs.shape[0]
        stacked = np.column_stack([
            lstm_probs.reshape(-1),
            transformer_probs.reshape(-1),
        ])
        probs = self.meta_learner.predict_proba(stacked)[:, 1]
        result = probs.reshape(n_samples, BINARY_DIM)

        if is_1d:
            return result.squeeze(0)
        return result

    def get_top6(self, probs: np.ndarray) -> list[int]:
        """
        확률 벡터에서 상위 6개 번호 선택 (1-indexed)

        Args:
            probs: (45,) 확률 벡터

        Returns:
            정렬된 상위 6개 번호 리스트
        """
        top_indices = np.argsort(probs)[-PICK_K:]
        top_numbers = sorted((idx + 1) for idx in top_indices)
        return top_numbers

    def get_confidence(self, probs: np.ndarray) -> float:
        """
        예측 신뢰도 계산 (상위 6개 확률의 평균)

        Args:
            probs: (45,) 확률 벡터

        Returns:
            신뢰도 (0~1)
        """
        top6_probs = np.sort(probs)[-PICK_K:]
        return float(np.mean(top6_probs))

    @staticmethod
    def _compute_top6_precision(probs: np.ndarray, targets: np.ndarray) -> float:
        """top-6 precision 계산"""
        n = probs.shape[0]
        if n == 0:
            return 0.0

        total_hits = 0
        for i in range(n):
            top6_idx = np.argsort(probs[i])[-PICK_K:]
            hits = targets[i, top6_idx].sum()
            total_hits += hits

        return total_hits / (n * PICK_K)
