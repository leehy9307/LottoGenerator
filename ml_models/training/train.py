"""
PyTorch 학습 루프: 조기 종료, 스케줄러, 체크포인트 저장
"""

import os
import sys
import time
import torch
import torch.nn as nn
from torch.optim import Adam
from torch.optim.lr_scheduler import ReduceLROnPlateau
from torch.utils.data import DataLoader

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import EPOCHS, LR, EARLY_STOPPING_PATIENCE, CHECKPOINT_DIR


class EarlyStopping:
    """조기 종료 (patience 내에 val loss 개선이 없으면 중단)"""

    def __init__(self, patience: int = EARLY_STOPPING_PATIENCE, min_delta: float = 1e-5):
        self.patience = patience
        self.min_delta = min_delta
        self.best_loss = float("inf")
        self.counter = 0
        self.should_stop = False

    def step(self, val_loss: float) -> bool:
        if val_loss < self.best_loss - self.min_delta:
            self.best_loss = val_loss
            self.counter = 0
        else:
            self.counter += 1
            if self.counter >= self.patience:
                self.should_stop = True

        return self.should_stop


def save_checkpoint(model: nn.Module, optimizer: torch.optim.Optimizer,
                    epoch: int, val_loss: float, model_name: str,
                    checkpoint_dir: str | None = None) -> str:
    """모델 체크포인트 저장"""
    if checkpoint_dir is None:
        checkpoint_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            CHECKPOINT_DIR,
        )
    os.makedirs(checkpoint_dir, exist_ok=True)

    path = os.path.join(checkpoint_dir, f"{model_name}_best.pt")
    torch.save({
        "epoch": epoch,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "val_loss": val_loss,
    }, path)

    return path


def load_checkpoint(model: nn.Module, model_name: str,
                    checkpoint_dir: str | None = None,
                    device: torch.device | None = None) -> dict | None:
    """저장된 체크포인트 로드"""
    if checkpoint_dir is None:
        checkpoint_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            CHECKPOINT_DIR,
        )

    path = os.path.join(checkpoint_dir, f"{model_name}_best.pt")
    if not os.path.exists(path):
        return None

    if device is None:
        device = torch.device("cpu")

    checkpoint = torch.load(path, map_location=device, weights_only=True)
    model.load_state_dict(checkpoint["model_state_dict"])

    return checkpoint


def train_model(model: nn.Module,
                criterion: nn.Module,
                train_loader: DataLoader,
                val_loader: DataLoader,
                model_name: str = "model",
                epochs: int = EPOCHS,
                lr: float = LR,
                patience: int = EARLY_STOPPING_PATIENCE,
                device: torch.device | None = None) -> dict:
    """
    모델 학습 실행

    Args:
        model: PyTorch 모델
        criterion: 손실 함수
        train_loader: 학습 데이터 로더
        val_loader: 검증 데이터 로더
        model_name: 체크포인트 저장용 이름
        epochs: 최대 에포크
        lr: 학습률
        patience: 조기 종료 patience
        device: 학습 디바이스

    Returns:
        학습 이력 딕셔너리
    """
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = model.to(device)
    optimizer = Adam(model.parameters(), lr=lr)
    scheduler = ReduceLROnPlateau(optimizer, mode="min", factor=0.5,
                                   patience=5, verbose=False)
    early_stopping = EarlyStopping(patience=patience)

    history = {
        "train_loss": [],
        "val_loss": [],
        "lr": [],
        "best_epoch": 0,
        "best_val_loss": float("inf"),
    }

    print(f"\n{'='*60}")
    print(f"학습 시작: {model_name}")
    print(f"디바이스: {device}, 에포크: {epochs}, 학습률: {lr}")
    print(f"{'='*60}")

    start_time = time.time()

    for epoch in range(1, epochs + 1):
        # --- 학습 단계 ---
        model.train()
        train_loss = 0.0
        train_batches = 0

        for X_batch, y_batch in train_loader:
            X_batch = X_batch.to(device)
            y_batch = y_batch.to(device)

            optimizer.zero_grad()
            logits = model(X_batch)
            loss = criterion(logits, y_batch)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            train_loss += loss.item()
            train_batches += 1

        avg_train_loss = train_loss / max(train_batches, 1)

        # --- 검증 단계 ---
        model.eval()
        val_loss = 0.0
        val_batches = 0

        with torch.no_grad():
            for X_batch, y_batch in val_loader:
                X_batch = X_batch.to(device)
                y_batch = y_batch.to(device)

                logits = model(X_batch)
                loss = criterion(logits, y_batch)
                val_loss += loss.item()
                val_batches += 1

        avg_val_loss = val_loss / max(val_batches, 1)

        # 기록
        current_lr = optimizer.param_groups[0]["lr"]
        history["train_loss"].append(avg_train_loss)
        history["val_loss"].append(avg_val_loss)
        history["lr"].append(current_lr)

        # 스케줄러 업데이트
        scheduler.step(avg_val_loss)

        # 최고 성능 체크포인트 저장
        if avg_val_loss < history["best_val_loss"]:
            history["best_val_loss"] = avg_val_loss
            history["best_epoch"] = epoch
            save_checkpoint(model, optimizer, epoch, avg_val_loss, model_name)

        # 로그 출력 (10 에포크마다 또는 마지막)
        if epoch % 10 == 0 or epoch == 1:
            elapsed = time.time() - start_time
            print(f"  Epoch {epoch:3d}/{epochs} | "
                  f"Train: {avg_train_loss:.4f} | "
                  f"Val: {avg_val_loss:.4f} | "
                  f"LR: {current_lr:.6f} | "
                  f"Time: {elapsed:.1f}s")

        # 조기 종료 확인
        if early_stopping.step(avg_val_loss):
            print(f"\n  조기 종료 (epoch {epoch}, patience {patience})")
            break

    # 최고 체크포인트 복원
    load_checkpoint(model, model_name, device=device)

    elapsed = time.time() - start_time
    print(f"\n학습 완료: {model_name}")
    print(f"  최고 에포크: {history['best_epoch']}")
    print(f"  최고 검증 손실: {history['best_val_loss']:.4f}")
    print(f"  총 소요 시간: {elapsed:.1f}s")

    return history


def get_model_predictions(model: nn.Module,
                          data_loader: DataLoader,
                          device: torch.device | None = None) -> tuple:
    """
    모델 예측값 추출

    Returns:
        probs: (N, 45) 확률 배열
        targets: (N, 45) 타겟 배열
    """
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = model.to(device)
    model.eval()

    all_probs = []
    all_targets = []

    with torch.no_grad():
        for X_batch, y_batch in data_loader:
            X_batch = X_batch.to(device)
            probs = model.predict_proba(X_batch).cpu().numpy()
            all_probs.append(probs)
            all_targets.append(y_batch.numpy())

    import numpy as np
    return np.concatenate(all_probs), np.concatenate(all_targets)
