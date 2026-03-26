"""
로또 데이터 전처리: 이진 벡터 인코딩, 슬라이딩 윈도우, 롤링 빈도 특성
"""

import os
import sys
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import (
    LOTTERY_N, PICK_K, SEQUENCE_LENGTH, BINARY_DIM,
    TRAIN_RATIO, VAL_RATIO, BATCH_SIZE,
)


def numbers_to_binary(numbers: list[int], dim: int = BINARY_DIM) -> np.ndarray:
    """
    번호 리스트를 이진 벡터로 변환

    Args:
        numbers: 로또 번호 리스트 (1-indexed)
        dim: 출력 벡터 차원 (기본 45)

    Returns:
        45차원 이진 벡터 (0/1)
    """
    vec = np.zeros(dim, dtype=np.float32)
    for n in numbers:
        if 1 <= n <= dim:
            vec[n - 1] = 1.0
    return vec


def df_to_binary_matrix(df: pd.DataFrame) -> np.ndarray:
    """
    DataFrame의 모든 회차를 이진 행렬로 변환

    Returns:
        (num_draws, 45) 이진 행렬
    """
    num_cols = ["n1", "n2", "n3", "n4", "n5", "n6"]
    matrix = np.zeros((len(df), BINARY_DIM), dtype=np.float32)

    for i, row in df.iterrows():
        numbers = [int(row[c]) for c in num_cols]
        matrix[i] = numbers_to_binary(numbers)

    return matrix


def compute_rolling_frequency(binary_matrix: np.ndarray,
                               windows: list[int] = None) -> np.ndarray:
    """
    각 번호의 롤링 빈도 특성 계산

    Args:
        binary_matrix: (num_draws, 45) 이진 행렬
        windows: 롤링 윈도우 크기 목록 (기본: [10, 20, 50])

    Returns:
        (num_draws, 45 * len(windows)) 롤링 빈도 행렬
    """
    if windows is None:
        windows = [10, 20, 50]

    num_draws = binary_matrix.shape[0]
    features = []

    for w in windows:
        freq = np.zeros_like(binary_matrix)
        for i in range(num_draws):
            start = max(0, i - w)
            if start < i:
                freq[i] = binary_matrix[start:i].mean(axis=0)
        features.append(freq)

    return np.concatenate(features, axis=1)


def create_sequences(binary_matrix: np.ndarray,
                     rolling_features: np.ndarray | None = None,
                     seq_len: int = SEQUENCE_LENGTH) -> tuple[np.ndarray, np.ndarray]:
    """
    슬라이딩 윈도우로 입력/타겟 시퀀스 생성

    Args:
        binary_matrix: (num_draws, 45) 이진 행렬
        rolling_features: (num_draws, feature_dim) 롤링 빈도 특성 (옵션)
        seq_len: 입력 시퀀스 길이

    Returns:
        X: (num_sequences, seq_len, feature_dim) 입력
        y: (num_sequences, 45) 타겟
    """
    if rolling_features is not None:
        # 이진 벡터 + 롤링 빈도를 합침
        combined = np.concatenate([binary_matrix, rolling_features], axis=1)
    else:
        combined = binary_matrix

    num_draws = binary_matrix.shape[0]
    X_list, y_list = [], []

    for i in range(seq_len, num_draws):
        X_list.append(combined[i - seq_len:i])
        y_list.append(binary_matrix[i])  # 타겟은 항상 45차원 이진 벡터

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.float32)

    return X, y


def chronological_split(X: np.ndarray, y: np.ndarray,
                        train_ratio: float = TRAIN_RATIO,
                        val_ratio: float = VAL_RATIO
                        ) -> tuple[tuple, tuple, tuple]:
    """
    시간순 분할 (미래 데이터 누출 방지)

    Returns:
        (X_train, y_train), (X_val, y_val), (X_test, y_test)
    """
    n = len(X)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    return (
        (X[:train_end], y[:train_end]),
        (X[train_end:val_end], y[train_end:val_end]),
        (X[val_end:], y[val_end:]),
    )


class LottoDataset(Dataset):
    """로또 시퀀스 PyTorch Dataset"""

    def __init__(self, X: np.ndarray, y: np.ndarray):
        self.X = torch.from_numpy(X)
        self.y = torch.from_numpy(y)

    def __len__(self) -> int:
        return len(self.X)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        return self.X[idx], self.y[idx]


def prepare_data(df: pd.DataFrame,
                 use_rolling: bool = True,
                 seq_len: int = SEQUENCE_LENGTH,
                 batch_size: int = BATCH_SIZE
                 ) -> tuple[DataLoader, DataLoader, DataLoader, int]:
    """
    DataFrame에서 학습/검증/테스트 DataLoader 생성

    Args:
        df: 로또 이력 DataFrame
        use_rolling: 롤링 빈도 특성 사용 여부
        seq_len: 입력 시퀀스 길이
        batch_size: 배치 크기

    Returns:
        train_loader, val_loader, test_loader, input_dim
    """
    # 회차 순서로 정렬
    df = df.sort_values("draw_no").reset_index(drop=True)

    # 이진 행렬 변환
    binary_matrix = df_to_binary_matrix(df)

    # 롤링 빈도 특성
    rolling_features = None
    if use_rolling:
        rolling_features = compute_rolling_frequency(binary_matrix)

    # 시퀀스 생성
    X, y = create_sequences(binary_matrix, rolling_features, seq_len)

    # 입력 차원 계산
    input_dim = X.shape[-1]

    # 시간순 분할
    (X_train, y_train), (X_val, y_val), (X_test, y_test) = chronological_split(X, y)

    print(f"데이터 분할: 학습={len(X_train)}, 검증={len(X_val)}, 테스트={len(X_test)}")
    print(f"입력 차원: {input_dim}, 시퀀스 길이: {seq_len}")

    # DataLoader 생성
    train_loader = DataLoader(
        LottoDataset(X_train, y_train),
        batch_size=batch_size, shuffle=False,  # 시계열이므로 shuffle 안 함
    )
    val_loader = DataLoader(
        LottoDataset(X_val, y_val),
        batch_size=batch_size, shuffle=False,
    )
    test_loader = DataLoader(
        LottoDataset(X_test, y_test),
        batch_size=batch_size, shuffle=False,
    )

    return train_loader, val_loader, test_loader, input_dim
