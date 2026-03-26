"""
동행복권 API에서 로또 6/45 전체 이력을 다운로드하여 CSV로 저장
"""

import os
import sys
import time
import requests
import pandas as pd

# 프로젝트 루트를 path에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import LOTTO_API_URL, DATA_CSV_PATH


def fetch_single_draw(draw_no: int) -> dict | None:
    """단일 회차 데이터 조회"""
    url = LOTTO_API_URL.format(draw_no)
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data.get("returnValue") != "success":
            return None

        return {
            "draw_no": data["drwNo"],
            "date": data["drwNoDate"],
            "n1": data["drwtNo1"],
            "n2": data["drwtNo2"],
            "n3": data["drwtNo3"],
            "n4": data["drwtNo4"],
            "n5": data["drwtNo5"],
            "n6": data["drwtNo6"],
            "bonus": data["bnusNo"],
        }
    except (requests.RequestException, KeyError, ValueError) as e:
        print(f"  [오류] 회차 {draw_no} 조회 실패: {e}")
        return None


def find_latest_draw() -> int:
    """이진 탐색으로 최신 회차 번호를 찾음"""
    low, high = 1, 2000
    latest = 1

    while low <= high:
        mid = (low + high) // 2
        result = fetch_single_draw(mid)
        if result is not None:
            latest = mid
            low = mid + 1
        else:
            high = mid - 1

    return latest


def fetch_all_draws(start: int = 1, end: int | None = None,
                    delay: float = 0.05) -> pd.DataFrame:
    """
    전체 로또 이력 다운로드

    Args:
        start: 시작 회차 (기본 1)
        end: 종료 회차 (None이면 최신까지)
        delay: API 호출 간 대기 시간 (초)

    Returns:
        로또 이력 DataFrame
    """
    if end is None:
        print("최신 회차 탐색 중...")
        end = find_latest_draw()
        print(f"최신 회차: {end}")

    records = []
    total = end - start + 1

    for i, draw_no in enumerate(range(start, end + 1), 1):
        result = fetch_single_draw(draw_no)
        if result is not None:
            records.append(result)

        if i % 50 == 0 or i == total:
            print(f"  진행: {i}/{total} ({i / total * 100:.1f}%)")

        time.sleep(delay)

    df = pd.DataFrame(records)
    df = df.sort_values("draw_no").reset_index(drop=True)
    return df


def save_to_csv(df: pd.DataFrame, path: str | None = None) -> str:
    """DataFrame을 CSV로 저장"""
    if path is None:
        path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            DATA_CSV_PATH,
        )

    os.makedirs(os.path.dirname(path), exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8-sig")
    print(f"저장 완료: {path} ({len(df)}개 회차)")
    return path


def load_from_csv(path: str | None = None) -> pd.DataFrame:
    """CSV에서 로또 이력 로드"""
    if path is None:
        path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            DATA_CSV_PATH,
        )

    if not os.path.exists(path):
        raise FileNotFoundError(f"데이터 파일이 없습니다: {path}. fetch_data.py를 먼저 실행하세요.")

    df = pd.read_csv(path)
    return df


def update_csv(path: str | None = None, delay: float = 0.05) -> pd.DataFrame:
    """기존 CSV에 새로운 회차 데이터를 추가"""
    if path is None:
        path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            DATA_CSV_PATH,
        )

    if os.path.exists(path):
        existing = pd.read_csv(path)
        last_draw = int(existing["draw_no"].max())
        print(f"기존 데이터: {len(existing)}개 회차 (최신: {last_draw}회)")
    else:
        existing = pd.DataFrame()
        last_draw = 0
        print("기존 데이터 없음. 전체 다운로드 시작.")

    latest = find_latest_draw()
    if latest <= last_draw:
        print("이미 최신 상태입니다.")
        return existing

    print(f"새 데이터 다운로드: {last_draw + 1}~{latest}회")
    new_data = fetch_all_draws(start=last_draw + 1, end=latest, delay=delay)

    if not new_data.empty:
        df = pd.concat([existing, new_data], ignore_index=True)
        df = df.sort_values("draw_no").reset_index(drop=True)
        save_to_csv(df, path)
        return df

    return existing


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="로또 6/45 데이터 수집")
    parser.add_argument("--update", action="store_true", help="기존 CSV 업데이트")
    parser.add_argument("--full", action="store_true", help="전체 다운로드")
    parser.add_argument("--start", type=int, default=1, help="시작 회차")
    parser.add_argument("--end", type=int, default=None, help="종료 회차")
    args = parser.parse_args()

    if args.update:
        update_csv()
    elif args.full:
        df = fetch_all_draws(start=args.start, end=args.end)
        save_to_csv(df)
    else:
        # 기본: 업데이트 모드
        update_csv()
