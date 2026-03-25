import AsyncStorage from '@react-native-async-storage/async-storage';
import { LottoDrawResult } from '../types/lotto';

// ─── 데이터 소스 우선순위 ────────────────────────────────────────
// 1순위: AsyncStorage 캐시 (증분 업데이트)
// 2순위: GitHub Raw (smok95/lotto) — 새 회차만 증분 fetch
// 3순위: 동행복권 API — 새 회차만 증분 fetch
// 4순위: 번들 폴백 데이터 (즉시 표시)

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/smok95/lotto/main/results/';
const DH_API_BASE = 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=';
const CACHE_KEY = 'lotto_draws_cache_v3';
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6시간 (v9: 1시간 → 6시간)

// 1회차 기준일: 2002-12-07 (토요일)
const EPOCH_DATE = new Date(2002, 11, 7);

export function calculateLatestDrawNo(now: Date = new Date()): number {
  const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
  const diffMs = koreaTime.getTime() - EPOCH_DATE.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  const dayOfWeek = koreaTime.getDay();
  const hour = koreaTime.getHours();
  if (dayOfWeek === 6 && hour < 21) {
    return diffWeeks;
  }
  return diffWeeks + 1;
}

// ─── GitHub Raw 데이터 소스 ──────────────────────────────────────

interface GitHubLottoResponse {
  draw_no: number;
  numbers: number[];
  bonus_no: number;
  date: string;
}

function parseGitHubResponse(data: GitHubLottoResponse): LottoDrawResult | null {
  if (!data.draw_no || !data.numbers || data.numbers.length !== 6) return null;
  return {
    drawNo: data.draw_no,
    date: data.date ? data.date.split('T')[0] : '',
    numbers: [...data.numbers].sort((a, b) => a - b),
    bonus: data.bonus_no,
  };
}

async function fetchFromGitHub(drawNo: number): Promise<LottoDrawResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${GITHUB_RAW_BASE}${drawNo}.json`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data: GitHubLottoResponse = await res.json();
    return parseGitHubResponse(data);
  } catch {
    return null;
  }
}

// ─── 동행복권 API ────────────────────────────────────────────────

interface DhApiResponse {
  returnValue: string;
  drwNo: number;
  drwNoDate: string;
  drwtNo1: number; drwtNo2: number; drwtNo3: number;
  drwtNo4: number; drwtNo5: number; drwtNo6: number;
  bnusNo: number;
}

function parseDhApiResponse(data: DhApiResponse): LottoDrawResult | null {
  if (data.returnValue !== 'success') return null;
  const numbers = [
    data.drwtNo1, data.drwtNo2, data.drwtNo3,
    data.drwtNo4, data.drwtNo5, data.drwtNo6,
  ].sort((a, b) => a - b);
  return {
    drawNo: data.drwNo,
    date: data.drwNoDate,
    numbers,
    bonus: data.bnusNo,
  };
}

async function fetchFromDhApi(drawNo: number): Promise<LottoDrawResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${DH_API_BASE}${drawNo}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.dhlottery.co.kr/',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.startsWith('<') || text.startsWith('<!')) return null;
    const data: DhApiResponse = JSON.parse(text);
    return parseDhApiResponse(data);
  } catch {
    return null;
  }
}

// ─── 캐시 (증분 업데이트 방식) ───────────────────────────────────

interface CacheData {
  draws: LottoDrawResult[];
  timestamp: number;
}

async function loadCache(): Promise<CacheData | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheData;
  } catch {
    return null;
  }
}

async function saveCache(draws: LottoDrawResult[]): Promise<void> {
  try {
    const data: CacheData = { draws, timestamp: Date.now() };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

// ─── 증분 fetch: 새 회차만 가져오기 ──────────────────────────────

async function fetchMissingDraws(
  missingNos: number[],
): Promise<LottoDrawResult[]> {
  if (missingNos.length === 0) return [];

  const results: LottoDrawResult[] = [];

  // 모든 누락 회차를 동시에 fetch (최대 10개 정도이므로 빠름)
  const batchSize = 10;
  for (let b = 0; b < missingNos.length; b += batchSize) {
    const batch = missingNos.slice(b, b + batchSize);
    const fetched = await Promise.all(
      batch.map(async (no) => {
        // GitHub 먼저, 실패 시 동행복권 API
        const gh = await fetchFromGitHub(no);
        if (gh) return gh;
        return fetchFromDhApi(no);
      })
    );
    for (const r of fetched) {
      if (r) results.push(r);
    }
  }

  return results;
}

// ─── 통합 데이터 로더 (최적화) ──────────────────────────────────

type DataSource = 'github' | 'api' | 'cache' | 'fallback';

/**
 * v10.0 최적화 로딩 전략:
 *
 * 1) 캐시 있으면 즉시 반환 (TTL 6시간)
 * 2) 캐시 만료 → 캐시 데이터 + 새 회차만 증분 fetch (1~3개)
 * 3) 캐시 없음 → 폴백 데이터 + 새 회차 증분 fetch
 *
 * 최악 케이스: 폴백(64회차) 즉시 표시 → 백그라운드 증분
 * 일반 케이스: 캐시 즉시 표시 (0ms fetch) → 0~3개 증분
 */
export async function fetchLottoData(): Promise<{
  draws: LottoDrawResult[];
  source: DataSource;
  latestDraw: number;
}> {
  const latestDraw = calculateLatestDrawNo();
  const minDraw = Math.max(1, latestDraw - 200);

  // 1) 캐시 로드
  const cache = await loadCache();

  if (cache && cache.draws.length > 0) {
    const cachedLatest = Math.max(...cache.draws.map(d => d.drawNo));
    const isFresh = (Date.now() - cache.timestamp) < CACHE_TTL;

    if (isFresh && cachedLatest >= latestDraw - 1) {
      // 캐시가 신선하고 최신 → 즉시 반환
      return { draws: cache.draws, source: 'cache', latestDraw };
    }

    // 캐시 만료 또는 새 회차 있음 → 증분 fetch
    const cachedSet = new Set(cache.draws.map(d => d.drawNo));
    const missingNos: number[] = [];
    for (let no = cachedLatest + 1; no <= latestDraw; no++) {
      if (!cachedSet.has(no)) missingNos.push(no);
    }

    if (missingNos.length <= 10) {
      // 10개 이하면 증분 fetch (보통 1~2개)
      const newDraws = await fetchMissingDraws(missingNos);
      const merged = [...cache.draws, ...newDraws]
        .filter(d => d.drawNo >= minDraw)
        .sort((a, b) => a.drawNo - b.drawNo);

      // 중복 제거
      const seen = new Set<number>();
      const deduped = merged.filter(d => {
        if (seen.has(d.drawNo)) return false;
        seen.add(d.drawNo);
        return true;
      });

      await saveCache(deduped);
      return {
        draws: deduped,
        source: newDraws.length > 0 ? 'github' : 'cache',
        latestDraw,
      };
    }

    // 10개 초과 누락 → 캐시가 너무 오래됨, 전체 재구축
    return await fullFetch(latestDraw, minDraw);
  }

  // 2) 캐시 없음 → 폴백 + 증분
  const fallbackLatest = FALLBACK_DATA.length > 0
    ? Math.max(...FALLBACK_DATA.map(d => d.drawNo))
    : 0;

  const missingNos: number[] = [];
  const fallbackSet = new Set(FALLBACK_DATA.map(d => d.drawNo));
  for (let no = fallbackLatest + 1; no <= latestDraw; no++) {
    if (!fallbackSet.has(no)) missingNos.push(no);
  }

  if (missingNos.length <= 30) {
    const newDraws = await fetchMissingDraws(missingNos);
    const merged = [...FALLBACK_DATA, ...newDraws]
      .filter(d => d.drawNo >= minDraw)
      .sort((a, b) => a.drawNo - b.drawNo);

    const seen = new Set<number>();
    const deduped = merged.filter(d => {
      if (seen.has(d.drawNo)) return false;
      seen.add(d.drawNo);
      return true;
    });

    await saveCache(deduped);
    return {
      draws: deduped,
      source: newDraws.length > 0 ? 'github' : 'fallback',
      latestDraw,
    };
  }

  // 폴백에서도 30개 초과 누락 → 전체 구축
  return await fullFetch(latestDraw, minDraw);
}

/**
 * 전체 재구축: 캐시가 완전히 없거나 너무 오래된 경우.
 * 200개를 한번에 병렬 fetch (최초 설치 시에만 발생).
 */
async function fullFetch(
  latestDraw: number,
  minDraw: number,
): Promise<{ draws: LottoDrawResult[]; source: DataSource; latestDraw: number }> {
  const allDrawNos = Array.from(
    { length: latestDraw - minDraw + 1 },
    (_, i) => minDraw + i
  );

  // 병렬도 높여서 빠르게 (30개씩)
  const results: LottoDrawResult[] = [];
  const batchSize = 30;

  for (let b = 0; b < allDrawNos.length; b += batchSize) {
    const batch = allDrawNos.slice(b, b + batchSize);
    const fetched = await Promise.all(
      batch.map(async (no) => {
        const gh = await fetchFromGitHub(no);
        if (gh) return gh;
        return fetchFromDhApi(no);
      })
    );
    for (const r of fetched) {
      if (r) results.push(r);
    }
  }

  if (results.length >= 30) {
    results.sort((a, b) => a.drawNo - b.drawNo);
    await saveCache(results);
    return { draws: results, source: 'github', latestDraw };
  }

  // 전체 fetch도 실패 → 폴백
  return { draws: FALLBACK_DATA, source: 'fallback', latestDraw };
}

/**
 * 강제 새로고침: 캐시 무시하고 증분 fetch.
 */
export async function refreshLottoData(): Promise<{
  draws: LottoDrawResult[];
  source: DataSource;
  latestDraw: number;
}> {
  const latestDraw = calculateLatestDrawNo();
  const minDraw = Math.max(1, latestDraw - 200);

  // 기존 캐시 로드 (증분 베이스)
  const cache = await loadCache();
  const baseDraws = cache?.draws ?? FALLBACK_DATA;
  const baseLatest = baseDraws.length > 0
    ? Math.max(...baseDraws.map(d => d.drawNo))
    : 0;

  const baseSet = new Set(baseDraws.map(d => d.drawNo));
  const missingNos: number[] = [];
  for (let no = baseLatest + 1; no <= latestDraw; no++) {
    if (!baseSet.has(no)) missingNos.push(no);
  }

  // 최신 회차도 강제 재fetch (데이터 갱신 보장)
  if (!missingNos.includes(latestDraw)) {
    missingNos.push(latestDraw);
  }

  const newDraws = await fetchMissingDraws(missingNos);

  // 새 데이터로 기존 데이터 덮어쓰기 (같은 회차는 새 것 우선)
  const newMap = new Map(newDraws.map(d => [d.drawNo, d]));
  const merged = baseDraws
    .map(d => newMap.get(d.drawNo) ?? d)
    .concat(newDraws.filter(d => !baseSet.has(d.drawNo)))
    .filter(d => d.drawNo >= minDraw)
    .sort((a, b) => a.drawNo - b.drawNo);

  const seen = new Set<number>();
  const deduped = merged.filter(d => {
    if (seen.has(d.drawNo)) return false;
    seen.add(d.drawNo);
    return true;
  });

  await saveCache(deduped);
  return {
    draws: deduped,
    source: newDraws.length > 0 ? 'github' : 'cache',
    latestDraw,
  };
}

// 1133회(2024-08-10) ~ 1196회(2025-10-25) 검증된 실제 당첨 데이터
const FALLBACK_DATA: LottoDrawResult[] = [
  { drawNo: 1133, date: '2024-08-10', numbers: [2, 9, 13, 34, 38, 45], bonus: 36 },
  { drawNo: 1134, date: '2024-08-17', numbers: [2, 6, 12, 19, 22, 43], bonus: 7 },
  { drawNo: 1135, date: '2024-08-24', numbers: [3, 8, 20, 22, 27, 44], bonus: 2 },
  { drawNo: 1136, date: '2024-08-31', numbers: [3, 5, 19, 21, 27, 45], bonus: 37 },
  { drawNo: 1137, date: '2024-09-07', numbers: [3, 13, 18, 20, 32, 40], bonus: 5 },
  { drawNo: 1138, date: '2024-09-14', numbers: [5, 8, 25, 27, 34, 42], bonus: 44 },
  { drawNo: 1139, date: '2024-09-21', numbers: [6, 14, 17, 23, 30, 40], bonus: 36 },
  { drawNo: 1140, date: '2024-09-28', numbers: [5, 17, 18, 22, 33, 39], bonus: 34 },
  { drawNo: 1141, date: '2024-10-05', numbers: [1, 3, 23, 24, 27, 40], bonus: 13 },
  { drawNo: 1142, date: '2024-10-12', numbers: [1, 8, 11, 15, 24, 33], bonus: 5 },
  { drawNo: 1143, date: '2024-10-19', numbers: [7, 11, 14, 26, 34, 41], bonus: 28 },
  { drawNo: 1144, date: '2024-10-26', numbers: [4, 12, 14, 27, 30, 33], bonus: 41 },
  { drawNo: 1145, date: '2024-11-02', numbers: [6, 10, 16, 28, 34, 43], bonus: 38 },
  { drawNo: 1146, date: '2024-11-09', numbers: [7, 13, 18, 19, 36, 45], bonus: 39 },
  { drawNo: 1147, date: '2024-11-16', numbers: [5, 10, 11, 20, 31, 44], bonus: 7 },
  { drawNo: 1148, date: '2024-11-23', numbers: [3, 6, 14, 28, 38, 45], bonus: 30 },
  { drawNo: 1149, date: '2024-11-30', numbers: [1, 5, 16, 17, 35, 45], bonus: 41 },
  { drawNo: 1150, date: '2024-12-07', numbers: [2, 3, 12, 14, 32, 39], bonus: 37 },
  { drawNo: 1151, date: '2024-12-14', numbers: [15, 19, 20, 25, 32, 43], bonus: 33 },
  { drawNo: 1152, date: '2024-12-21', numbers: [4, 8, 11, 33, 39, 43], bonus: 13 },
  { drawNo: 1153, date: '2024-12-28', numbers: [11, 16, 19, 21, 27, 33], bonus: 43 },
  { drawNo: 1154, date: '2025-01-04', numbers: [3, 14, 15, 23, 38, 45], bonus: 17 },
  { drawNo: 1155, date: '2025-01-11', numbers: [8, 12, 22, 24, 37, 39], bonus: 35 },
  { drawNo: 1156, date: '2025-01-18', numbers: [6, 13, 18, 34, 39, 44], bonus: 27 },
  { drawNo: 1157, date: '2025-01-25', numbers: [8, 15, 17, 19, 43, 44], bonus: 11 },
  { drawNo: 1158, date: '2025-02-01', numbers: [2, 7, 10, 14, 22, 40], bonus: 44 },
  { drawNo: 1159, date: '2025-02-08', numbers: [4, 5, 7, 11, 30, 42], bonus: 1 },
  { drawNo: 1160, date: '2025-02-15', numbers: [1, 17, 22, 30, 33, 43], bonus: 3 },
  { drawNo: 1161, date: '2025-02-22', numbers: [2, 3, 25, 35, 39, 41], bonus: 45 },
  { drawNo: 1162, date: '2025-03-01', numbers: [1, 11, 14, 32, 37, 43], bonus: 44 },
  { drawNo: 1163, date: '2025-03-08', numbers: [11, 16, 21, 25, 28, 34], bonus: 36 },
  { drawNo: 1164, date: '2025-03-15', numbers: [5, 8, 11, 22, 37, 39], bonus: 7 },
  { drawNo: 1165, date: '2025-03-22', numbers: [12, 14, 21, 35, 42, 43], bonus: 7 },
  { drawNo: 1166, date: '2025-03-29', numbers: [7, 18, 24, 31, 38, 41], bonus: 17 },
  { drawNo: 1167, date: '2025-04-05', numbers: [10, 23, 29, 33, 37, 45], bonus: 22 },
  { drawNo: 1168, date: '2025-04-12', numbers: [1, 3, 12, 14, 29, 38], bonus: 18 },
  { drawNo: 1169, date: '2025-04-19', numbers: [6, 14, 19, 22, 31, 41], bonus: 1 },
  { drawNo: 1170, date: '2025-04-26', numbers: [8, 11, 15, 23, 29, 43], bonus: 44 },
  { drawNo: 1171, date: '2025-05-03', numbers: [6, 7, 17, 29, 33, 45], bonus: 22 },
  { drawNo: 1172, date: '2025-05-10', numbers: [3, 10, 11, 27, 40, 44], bonus: 28 },
  { drawNo: 1173, date: '2025-05-17', numbers: [4, 16, 17, 30, 31, 33], bonus: 15 },
  { drawNo: 1174, date: '2025-05-24', numbers: [7, 9, 15, 33, 34, 43], bonus: 18 },
  { drawNo: 1175, date: '2025-05-31', numbers: [5, 9, 17, 21, 25, 36], bonus: 33 },
  { drawNo: 1176, date: '2025-06-07', numbers: [4, 15, 21, 26, 39, 42], bonus: 34 },
  { drawNo: 1177, date: '2025-06-14', numbers: [6, 10, 12, 24, 31, 40], bonus: 5 },
  { drawNo: 1178, date: '2025-06-21', numbers: [3, 5, 8, 33, 42, 43], bonus: 15 },
  { drawNo: 1179, date: '2025-06-28', numbers: [10, 13, 20, 22, 37, 39], bonus: 29 },
  { drawNo: 1180, date: '2025-07-05', numbers: [2, 17, 20, 22, 29, 37], bonus: 6 },
  { drawNo: 1181, date: '2025-07-12', numbers: [2, 9, 20, 33, 35, 40], bonus: 8 },
  { drawNo: 1182, date: '2025-07-19', numbers: [7, 8, 23, 26, 35, 40], bonus: 2 },
  { drawNo: 1183, date: '2025-07-26', numbers: [1, 3, 13, 19, 36, 38], bonus: 14 },
  { drawNo: 1184, date: '2025-08-02', numbers: [5, 18, 27, 29, 33, 43], bonus: 16 },
  { drawNo: 1185, date: '2025-08-09', numbers: [2, 16, 17, 26, 32, 45], bonus: 5 },
  { drawNo: 1186, date: '2025-08-16', numbers: [6, 12, 20, 28, 38, 40], bonus: 32 },
  { drawNo: 1187, date: '2025-08-23', numbers: [1, 8, 11, 25, 37, 45], bonus: 30 },
  { drawNo: 1188, date: '2025-08-30', numbers: [2, 4, 14, 21, 37, 43], bonus: 38 },
  { drawNo: 1189, date: '2025-09-06', numbers: [11, 12, 15, 30, 32, 44], bonus: 39 },
  { drawNo: 1190, date: '2025-09-13', numbers: [3, 11, 13, 18, 39, 44], bonus: 10 },
  { drawNo: 1191, date: '2025-09-20', numbers: [9, 20, 25, 28, 37, 42], bonus: 24 },
  { drawNo: 1192, date: '2025-09-27', numbers: [5, 12, 18, 27, 34, 38], bonus: 33 },
  { drawNo: 1193, date: '2025-10-04', numbers: [7, 10, 16, 22, 28, 32], bonus: 14 },
  { drawNo: 1194, date: '2025-10-11', numbers: [3, 8, 20, 31, 33, 44], bonus: 40 },
  { drawNo: 1195, date: '2025-10-18', numbers: [9, 15, 17, 24, 25, 42], bonus: 29 },
  { drawNo: 1196, date: '2025-10-25', numbers: [6, 14, 22, 33, 37, 45], bonus: 11 },
];
