"""
예측 결과를 JSON 파일로 내보내기
하이브리드 파이프라인에서 소비하는 predictions.json 생성
"""

import os
import sys
import json
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import OUTPUT_PATH


MODEL_VERSION = "1.0.0"


def build_prediction_json(predictions: dict) -> dict:
    """
    예측 결과를 JSON 스키마에 맞게 변환

    Args:
        predictions: predict_next_draw()의 반환값

    Returns:
        JSON 직렬화 가능한 딕셔너리
    """
    output = {
        "model_version": MODEL_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "based_on_draw": predictions.get("based_on_draw", 0),
        "predictions": {},
    }

    for model_name in ["lstm", "transformer", "ensemble"]:
        if model_name in predictions:
            pred = predictions[model_name]
            output["predictions"][model_name] = {
                "probabilities": [round(p, 6) for p in pred["probabilities"]],
                "top6": pred["top6"],
                "confidence": round(pred["confidence"], 6),
            }

    return output


def export_predictions(predictions: dict,
                       output_path: str | None = None) -> str:
    """
    예측 결과를 JSON 파일로 저장

    Args:
        predictions: predict_next_draw()의 반환값
        output_path: 출력 경로 (None이면 config의 OUTPUT_PATH 사용)

    Returns:
        저장된 파일 경로
    """
    if output_path is None:
        output_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            OUTPUT_PATH,
        )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    json_data = build_prediction_json(predictions)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    print(f"예측 JSON 저장 완료: {output_path}")
    print(f"  모델 버전: {json_data['model_version']}")
    print(f"  생성 시각: {json_data['generated_at']}")
    print(f"  기준 회차: {json_data['based_on_draw']}")
    print(f"  포함 모델: {list(json_data['predictions'].keys())}")

    return output_path


def load_predictions(input_path: str | None = None) -> dict | None:
    """
    저장된 예측 JSON 로드

    Args:
        input_path: 입력 경로

    Returns:
        예측 딕셔너리 또는 None
    """
    if input_path is None:
        input_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            OUTPUT_PATH,
        )

    if not os.path.exists(input_path):
        return None

    with open(input_path, "r", encoding="utf-8") as f:
        return json.load(f)


if __name__ == "__main__":
    from inference.predict import predict_next_draw

    predictions = predict_next_draw()
    export_predictions(predictions)
