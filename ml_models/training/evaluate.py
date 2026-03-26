"""
모델 평가: top-6 precision/recall/F1, 백테스트, 캘리브레이션, 기준선 비교
"""

import numpy as np

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import PICK_K, LOTTERY_N


def top6_metrics(probs: np.ndarray, targets: np.ndarray) -> dict:
    """
    Top-6 precision, recall, F1 계산

    Args:
        probs: (N, 45) 예측 확률
        targets: (N, 45) 실제 이진 벡터

    Returns:
        {"precision": float, "recall": float, "f1": float}
    """
    n = probs.shape[0]
    if n == 0:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    total_precision_hits = 0
    total_recall_hits = 0
    total_actual = 0

    for i in range(n):
        predicted_idx = set(np.argsort(probs[i])[-PICK_K:])
        actual_idx = set(np.where(targets[i] == 1.0)[0])

        hits = len(predicted_idx & actual_idx)
        total_precision_hits += hits
        total_recall_hits += hits
        total_actual += len(actual_idx)

    precision = total_precision_hits / (n * PICK_K)
    recall = total_recall_hits / total_actual if total_actual > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

    return {"precision": precision, "recall": recall, "f1": f1}


def random_baseline_metrics(targets: np.ndarray, n_trials: int = 1000) -> dict:
    """
    랜덤 기준선 성능 (이론치 + 시뮬레이션)

    이론적 기준선: 각 번호의 선택 확률 = 6/45 ≈ 0.1333

    Returns:
        {"theoretical_precision": float, "simulated_precision": float}
    """
    # 이론치
    theoretical = PICK_K / LOTTERY_N

    # 시뮬레이션
    n = targets.shape[0]
    sim_hits = 0

    rng = np.random.default_rng(42)
    for trial in range(n_trials):
        total_trial_hits = 0
        for i in range(n):
            random_pick = set(rng.choice(LOTTERY_N, size=PICK_K, replace=False))
            actual_idx = set(np.where(targets[i] == 1.0)[0])
            total_trial_hits += len(random_pick & actual_idx)
        sim_hits += total_trial_hits / (n * PICK_K)

    simulated = sim_hits / n_trials

    return {
        "theoretical_precision": theoretical,
        "simulated_precision": simulated,
    }


def backtest(model, dataset_sequences: list, device=None) -> dict:
    """
    백테스트: 각 테스트 회차에 대해 이전 데이터만 사용하여 예측

    Args:
        model: 학습된 PyTorch 모델 (predict_proba 메서드 필요)
        dataset_sequences: [(X_tensor, y_array), ...] 시간순 시퀀스
        device: torch device

    Returns:
        {"per_draw_hits": list, "avg_hits": float, "precision": float}
    """
    import torch

    if device is None:
        device = torch.device("cpu")

    model = model.to(device)
    model.eval()

    per_draw_hits = []

    with torch.no_grad():
        for X_tensor, y_array in dataset_sequences:
            X_tensor = X_tensor.unsqueeze(0).to(device)
            probs = model.predict_proba(X_tensor).cpu().numpy().squeeze()

            predicted_idx = set(np.argsort(probs)[-PICK_K:])
            actual_idx = set(np.where(y_array == 1.0)[0])
            hits = len(predicted_idx & actual_idx)
            per_draw_hits.append(hits)

    avg_hits = np.mean(per_draw_hits) if per_draw_hits else 0.0
    precision = avg_hits / PICK_K

    return {
        "per_draw_hits": per_draw_hits,
        "avg_hits": float(avg_hits),
        "precision": float(precision),
    }


def calibration_check(probs: np.ndarray, targets: np.ndarray,
                      n_bins: int = 10) -> dict:
    """
    캘리브레이션 검증: 예측 확률 구간별 실제 발생 비율 비교

    Args:
        probs: (N, 45) 예측 확률
        targets: (N, 45) 실제 이진 벡터
        n_bins: 확률 구간 수

    Returns:
        {"bins": list, "predicted_freq": list, "actual_freq": list, "ece": float}
    """
    flat_probs = probs.flatten()
    flat_targets = targets.flatten()

    bin_edges = np.linspace(0.0, 1.0, n_bins + 1)
    bins = []
    predicted_freq = []
    actual_freq = []
    ece = 0.0  # Expected Calibration Error

    for i in range(n_bins):
        low, high = bin_edges[i], bin_edges[i + 1]
        mask = (flat_probs >= low) & (flat_probs < high)
        if i == n_bins - 1:
            mask = (flat_probs >= low) & (flat_probs <= high)

        count = mask.sum()
        if count == 0:
            bins.append(f"[{low:.2f}, {high:.2f})")
            predicted_freq.append(0.0)
            actual_freq.append(0.0)
            continue

        pred_mean = flat_probs[mask].mean()
        actual_mean = flat_targets[mask].mean()

        bins.append(f"[{low:.2f}, {high:.2f})")
        predicted_freq.append(float(pred_mean))
        actual_freq.append(float(actual_mean))

        ece += (count / len(flat_probs)) * abs(pred_mean - actual_mean)

    return {
        "bins": bins,
        "predicted_freq": predicted_freq,
        "actual_freq": actual_freq,
        "ece": float(ece),
    }


def print_evaluation_report(model_name: str,
                            probs: np.ndarray,
                            targets: np.ndarray) -> dict:
    """
    종합 평가 리포트 출력

    Args:
        model_name: 모델 이름
        probs: (N, 45) 예측 확률
        targets: (N, 45) 실제 이진 벡터

    Returns:
        전체 평가 결과 딕셔너리
    """
    print(f"\n{'='*60}")
    print(f"평가 리포트: {model_name}")
    print(f"{'='*60}")

    # Top-6 지표
    metrics = top6_metrics(probs, targets)
    print(f"\n  Top-6 Precision: {metrics['precision']:.4f}")
    print(f"  Top-6 Recall:    {metrics['recall']:.4f}")
    print(f"  Top-6 F1:        {metrics['f1']:.4f}")

    # 랜덤 기준선
    baseline = random_baseline_metrics(targets, n_trials=100)
    print(f"\n  랜덤 기준선 (이론): {baseline['theoretical_precision']:.4f}")
    print(f"  랜덤 기준선 (시뮬): {baseline['simulated_precision']:.4f}")

    improvement = metrics["precision"] / baseline["theoretical_precision"]
    print(f"  기준선 대비:       {improvement:.2f}x")

    # 캘리브레이션
    cal = calibration_check(probs, targets)
    print(f"\n  ECE (Expected Calibration Error): {cal['ece']:.4f}")

    print(f"{'='*60}\n")

    return {
        "model_name": model_name,
        "metrics": metrics,
        "baseline": baseline,
        "calibration": cal,
        "improvement_over_baseline": improvement,
    }
