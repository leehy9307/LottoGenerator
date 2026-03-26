"""
LSTM 기반 로또 번호 예측 모델
"""

import torch
import torch.nn as nn

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import (
    BINARY_DIM, LSTM_HIDDEN_SIZE, LSTM_NUM_LAYERS, LSTM_DROPOUT,
)


class LottoLSTM(nn.Module):
    """
    2-layer LSTM 로또 예측 모델

    입력: (batch, seq_len, input_dim)
    출력: (batch, 45) - 각 번호의 출현 확률 (sigmoid 적용 전 logits)
    """

    def __init__(self,
                 input_dim: int = BINARY_DIM,
                 hidden_size: int = LSTM_HIDDEN_SIZE,
                 num_layers: int = LSTM_NUM_LAYERS,
                 dropout: float = LSTM_DROPOUT,
                 output_dim: int = BINARY_DIM):
        super().__init__()

        self.hidden_size = hidden_size
        self.num_layers = num_layers

        # LSTM 레이어
        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )

        # 드롭아웃
        self.dropout = nn.Dropout(dropout)

        # 출력 FC 레이어
        self.fc = nn.Linear(hidden_size, output_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch, seq_len, input_dim) 입력 시퀀스

        Returns:
            (batch, 45) logits (BCEWithLogitsLoss와 함께 사용)
        """
        # LSTM 순전파 - 마지막 타임스텝의 출력만 사용
        lstm_out, _ = self.lstm(x)
        last_output = lstm_out[:, -1, :]  # (batch, hidden_size)

        # FC 레이어
        out = self.dropout(last_output)
        logits = self.fc(out)  # (batch, 45)

        return logits

    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        """확률값 출력 (추론 시 사용)"""
        logits = self.forward(x)
        return torch.sigmoid(logits)


def create_lstm_model(input_dim: int = BINARY_DIM, **kwargs) -> tuple[LottoLSTM, nn.Module]:
    """
    LSTM 모델과 손실 함수 생성

    Returns:
        model, criterion
    """
    model = LottoLSTM(input_dim=input_dim, **kwargs)
    criterion = nn.BCEWithLogitsLoss()
    return model, criterion
