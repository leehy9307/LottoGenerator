"""
로또 예측 모델 설정값
"""

# 로또 기본 파라미터
LOTTERY_N = 45          # 전체 번호 개수 (1~45)
PICK_K = 6              # 추첨 번호 개수

# 시퀀스 파라미터
SEQUENCE_LENGTH = 10    # 입력 시퀀스 길이 (최근 N회차)
BINARY_DIM = 45         # 이진 벡터 차원

# 데이터 분할 비율
TRAIN_RATIO = 0.8
VAL_RATIO = 0.1
TEST_RATIO = 0.1

# 학습 하이퍼파라미터
BATCH_SIZE = 32
EPOCHS = 100
LR = 0.001

# LSTM 모델 파라미터
LSTM_HIDDEN_SIZE = 128
LSTM_NUM_LAYERS = 2
LSTM_DROPOUT = 0.3

# Transformer 모델 파라미터
TRANSFORMER_D_MODEL = 128
TRANSFORMER_N_HEADS = 4
TRANSFORMER_N_LAYERS = 4
TRANSFORMER_D_FF = 256
TRANSFORMER_DROPOUT = 0.2

# 조기 종료
EARLY_STOPPING_PATIENCE = 10

# 출력 경로
OUTPUT_PATH = "outputs/predictions.json"
CHECKPOINT_DIR = "outputs/checkpoints"

# 데이터 경로
DATA_CSV_PATH = "data/lotto_history.csv"

# 데이터 수집
LOTTO_API_URL = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"
