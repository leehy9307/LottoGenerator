"""
최신 모델 체크포인트를 로드하여 다음 회차 예측 수행
"""

import os
import sys
import numpy as np
import torch
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import SEQUENCE_LENGTH, BINARY_DIM, PICK_K
from data.preprocess import df_to_binary_matrix, compute_rolling_frequency
from data.fetch_data import load_from_csv
from models.lstm_model import LottoLSTM, create_lstm_model
from models.transformer_model import LottoTransformer, create_transformer_model
from models.ensemble import LottoEnsemble
from training.train import load_checkpoint


def prepare_latest_input(df: pd.DataFrame,
                         seq_len: int = SEQUENCE_LENGTH,
                         use_rolling: bool = True) -> torch.Tensor:
    """
    최신 seq_len 회차 데이터로 모델 입력 텐서 생성

    Args:
        df: 로또 이력 DataFrame (draw_no 기준 정렬 필요)
        seq_len: 시퀀스 길이
        use_rolling: 롤링 빈도 특성 사용 여부

    Returns:
        (1, seq_len, input_dim) 텐서
    """
    df = df.sort_values("draw_no").reset_index(drop=True)
    binary_matrix = df_to_binary_matrix(df)

    if use_rolling:
        rolling_features = compute_rolling_frequency(binary_matrix)
        combined = np.concatenate([binary_matrix, rolling_features], axis=1)
    else:
        combined = binary_matrix

    # 마지막 seq_len 회차
    latest = combined[-seq_len:]
    tensor = torch.from_numpy(latest).unsqueeze(0)  # (1, seq_len, input_dim)
    return tensor


def load_trained_model(model_name: str,
                       input_dim: int,
                       device: torch.device | None = None):
    """
    학습된 모델 로드

    Args:
        model_name: "lstm" 또는 "transformer"
        input_dim: 입력 차원
        device: torch device

    Returns:
        로드된 모델 (eval 모드)
    """
    if device is None:
        device = torch.device("cpu")

    if model_name == "lstm":
        model, _ = create_lstm_model(input_dim=input_dim)
    elif model_name == "transformer":
        model, _ = create_transformer_model(input_dim=input_dim)
    else:
        raise ValueError(f"알 수 없는 모델: {model_name}")

    checkpoint = load_checkpoint(model, model_name, device=device)
    if checkpoint is None:
        raise FileNotFoundError(
            f"체크포인트를 찾을 수 없습니다: {model_name}_best.pt"
        )

    model = model.to(device)
    model.eval()
    return model


def predict_next_draw(use_rolling: bool = True,
                      device: torch.device | None = None) -> dict:
    """
    다음 회차 번호 예측

    Returns:
        {
            "based_on_draw": int,
            "lstm": {"probabilities": list, "top6": list, "confidence": float},
            "transformer": {"probabilities": list, "top6": list, "confidence": float},
            "ensemble": {"probabilities": list, "top6": list, "confidence": float},
        }
    """
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # 데이터 로드
    df = load_from_csv()
    latest_draw = int(df["draw_no"].max())

    # 입력 텐서 생성
    input_tensor = prepare_latest_input(df, use_rolling=use_rolling)
    input_dim = input_tensor.shape[-1]
    input_tensor = input_tensor.to(device)

    results = {"based_on_draw": latest_draw}
    ensemble = LottoEnsemble()

    # LSTM 예측
    try:
        lstm_model = load_trained_model("lstm", input_dim, device)
        with torch.no_grad():
            lstm_probs = lstm_model.predict_proba(input_tensor).cpu().numpy().squeeze()

        results["lstm"] = {
            "probabilities": lstm_probs.tolist(),
            "top6": ensemble.get_top6(lstm_probs),
            "confidence": ensemble.get_confidence(lstm_probs),
        }
        print(f"LSTM 예측 완료 — Top-6: {results['lstm']['top6']}")
    except FileNotFoundError:
        print("경고: LSTM 체크포인트 없음. 건너뜁니다.")
        lstm_probs = None

    # Transformer 예측
    try:
        tf_model = load_trained_model("transformer", input_dim, device)
        with torch.no_grad():
            tf_probs = tf_model.predict_proba(input_tensor).cpu().numpy().squeeze()

        results["transformer"] = {
            "probabilities": tf_probs.tolist(),
            "top6": ensemble.get_top6(tf_probs),
            "confidence": ensemble.get_confidence(tf_probs),
        }
        print(f"Transformer 예측 완료 — Top-6: {results['transformer']['top6']}")
    except FileNotFoundError:
        print("경고: Transformer 체크포인트 없음. 건너뜁니다.")
        tf_probs = None

    # 앙상블 예측
    if lstm_probs is not None and tf_probs is not None:
        ens_probs = ensemble.predict(lstm_probs, tf_probs)
        results["ensemble"] = {
            "probabilities": ens_probs.tolist(),
            "top6": ensemble.get_top6(ens_probs),
            "confidence": ensemble.get_confidence(ens_probs),
        }
        print(f"앙상블 예측 완료 — Top-6: {results['ensemble']['top6']}")

    return results


if __name__ == "__main__":
    results = predict_next_draw()

    print(f"\n{'='*60}")
    print(f"다음 회차 예측 (기준: {results['based_on_draw']}회)")
    print(f"{'='*60}")

    for model_name in ["lstm", "transformer", "ensemble"]:
        if model_name in results:
            pred = results[model_name]
            print(f"\n  {model_name.upper()}")
            print(f"    번호: {pred['top6']}")
            print(f"    신뢰도: {pred['confidence']:.4f}")
