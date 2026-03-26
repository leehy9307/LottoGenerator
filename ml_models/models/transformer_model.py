"""
Transformer 기반 로또 번호 예측 모델
"""

import math
import torch
import torch.nn as nn

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import (
    BINARY_DIM, TRANSFORMER_D_MODEL, TRANSFORMER_N_HEADS,
    TRANSFORMER_N_LAYERS, TRANSFORMER_D_FF, TRANSFORMER_DROPOUT,
)


class SinusoidalPositionalEncoding(nn.Module):
    """사인파 위치 인코딩"""

    def __init__(self, d_model: int, max_len: int = 500, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)

        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
        )

        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)  # (1, max_len, d_model)

        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch, seq_len, d_model)
        """
        x = x + self.pe[:, :x.size(1), :]
        return self.dropout(x)


class LottoTransformer(nn.Module):
    """
    Transformer Encoder 기반 로또 예측 모델

    입력: (batch, seq_len, input_dim)
    출력: (batch, 45) - 각 번호의 출현 확률 (sigmoid 적용 전 logits)
    """

    def __init__(self,
                 input_dim: int = BINARY_DIM,
                 d_model: int = TRANSFORMER_D_MODEL,
                 n_heads: int = TRANSFORMER_N_HEADS,
                 n_layers: int = TRANSFORMER_N_LAYERS,
                 d_ff: int = TRANSFORMER_D_FF,
                 dropout: float = TRANSFORMER_DROPOUT,
                 output_dim: int = BINARY_DIM):
        super().__init__()

        self.d_model = d_model

        # 입력 프로젝션 (input_dim -> d_model)
        self.input_projection = nn.Linear(input_dim, d_model)

        # 위치 인코딩
        self.pos_encoding = SinusoidalPositionalEncoding(d_model, dropout=dropout)

        # Transformer Encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=n_heads,
            dim_feedforward=d_ff,
            dropout=dropout,
            batch_first=True,
            activation="gelu",
        )
        self.transformer_encoder = nn.TransformerEncoder(
            encoder_layer, num_layers=n_layers
        )

        # 출력 레이어
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(d_model, output_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch, seq_len, input_dim) 입력 시퀀스

        Returns:
            (batch, 45) logits
        """
        # 입력 프로젝션 + 스케일링
        x = self.input_projection(x) * math.sqrt(self.d_model)

        # 위치 인코딩
        x = self.pos_encoding(x)

        # Transformer Encoder
        x = self.transformer_encoder(x)

        # 마지막 타임스텝의 출력 사용 (CLS 토큰 대신)
        x = x[:, -1, :]  # (batch, d_model)

        # 출력
        x = self.dropout(x)
        logits = self.fc(x)  # (batch, 45)

        return logits

    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        """확률값 출력 (추론 시 사용)"""
        logits = self.forward(x)
        return torch.sigmoid(logits)


def create_transformer_model(input_dim: int = BINARY_DIM,
                              **kwargs) -> tuple[LottoTransformer, nn.Module]:
    """
    Transformer 모델과 손실 함수 생성

    Returns:
        model, criterion
    """
    model = LottoTransformer(input_dim=input_dim, **kwargs)
    criterion = nn.BCEWithLogitsLoss()
    return model, criterion
