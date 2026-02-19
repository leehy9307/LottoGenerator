import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchLottoData, refreshLottoData } from '../services/lottoApi';
import { calculateFrequencies, getHotNumbers, getColdNumbers } from '../analysis/frequencyAnalysis';
import { chiSquareTest } from '../analysis/statisticalTests';
import { generateExpertPick } from '../analysis/numberGenerator';
import { AppState, AnalysisResult, LottoDrawResult } from '../types/lotto';

function runAnalysis(draws: LottoDrawResult[], timestamp: number): AnalysisResult {
  const frequencies = calculateFrequencies(draws);
  const hotNumbers = getHotNumbers(frequencies);
  const coldNumbers = getColdNumbers(frequencies);
  const expertPick = generateExpertPick(draws, timestamp);
  const chiResult = chiSquareTest(frequencies, draws.length);
  const latestDraw = draws[draws.length - 1].drawNo;

  return {
    hotNumbers,
    coldNumbers,
    expertPick,
    allFrequencies: frequencies,
    totalDraws: draws.length,
    drawRange: {
      from: draws[0].drawNo,
      to: latestDraw,
    },
    chiSquareP: chiResult.pValue,
    isUniform: chiResult.isUniform,
    generatedAt: timestamp,
    nextDrawNo: latestDraw + 1,
  };
}

export function useLottoData() {
  const [state, setState] = useState<AppState>({
    loading: true,
    refreshing: false,
    error: null,
    analysis: null,
    dataSource: 'fallback',
  });
  const [triggerKey, setTriggerKey] = useState(0);
  const drawsRef = useRef<LottoDrawResult[]>([]);

  // 앱 시작 시 데이터 로드
  const loadInitial = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { draws, source } = await fetchLottoData();
      drawsRef.current = draws;
      const now = Date.now();
      const analysis = runAnalysis(draws, now);

      setState({
        loading: false,
        refreshing: false,
        error: null,
        analysis,
        dataSource: source,
      });
      setTriggerKey(prev => prev + 1);
    } catch {
      setState(prev => ({
        ...prev,
        loading: false,
        error: '데이터를 불러오는데 실패했습니다.',
      }));
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // 새로고침: 강제 API 재호출 + 현재 시각 기반 재생성
  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, refreshing: true, error: null }));
    try {
      const { draws, source } = await refreshLottoData();
      drawsRef.current = draws;
      const now = Date.now();
      const analysis = runAnalysis(draws, now);

      setState({
        loading: false,
        refreshing: false,
        error: null,
        analysis,
        dataSource: source,
      });
      setTriggerKey(prev => prev + 1);
    } catch {
      setState(prev => ({
        ...prev,
        refreshing: false,
        error: '새로고침에 실패했습니다.',
      }));
    }
  }, []);

  // 번호만 재생성 (데이터 다시 안받고 현재 시간으로 Expert Pick만 갱신)
  const regenerate = useCallback(() => {
    if (drawsRef.current.length === 0) return;
    const now = Date.now();
    const analysis = runAnalysis(drawsRef.current, now);
    setState(prev => ({
      ...prev,
      analysis,
    }));
    setTriggerKey(prev => prev + 1);
  }, []);

  return { ...state, triggerKey, refresh, regenerate };
}
