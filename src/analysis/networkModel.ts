import { LottoDrawResult } from '../types/lotto';

/**
 * Model G: Co-occurrence Network PageRank — 그래프 중심성으로 "허브" 번호 발견
 *
 * 45x45 동시출현 그래프에 PageRank(d=0.85) 적용
 * 70% PageRank + 30% Betweenness Centrality 결합
 *
 * 허브 번호 = 다양한 번호와 자주 공출현하는 "연결고리" 번호
 */

/**
 * PageRank + Betweenness Centrality 기반 번호 중심성 점수
 */
export function networkCentralityScore(draws: LottoDrawResult[]): Map<number, number> {
  const N = 45;

  // 동시출현 행렬 구축
  const coMatrix: number[][] = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  for (const draw of draws) {
    for (let a = 0; a < draw.numbers.length; a++) {
      for (let b = a + 1; b < draw.numbers.length; b++) {
        coMatrix[draw.numbers[a]][draw.numbers[b]]++;
        coMatrix[draw.numbers[b]][draw.numbers[a]]++;
      }
    }
  }

  // 가중 인접행렬 → 전이확률 행렬 (행 정규화)
  const transitionMatrix: number[][] = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  for (let i = 1; i <= N; i++) {
    let rowSum = 0;
    for (let j = 1; j <= N; j++) {
      rowSum += coMatrix[i][j];
    }
    if (rowSum > 0) {
      for (let j = 1; j <= N; j++) {
        transitionMatrix[i][j] = coMatrix[i][j] / rowSum;
      }
    } else {
      // 고립 노드: 균일 분포
      for (let j = 1; j <= N; j++) {
        transitionMatrix[i][j] = 1 / N;
      }
    }
  }

  // PageRank (d=0.85, 30 iterations)
  const d = 0.85;
  const iterations = 30;
  let pageRank = new Array(N + 1).fill(1 / N);

  for (let iter = 0; iter < iterations; iter++) {
    const newRank = new Array(N + 1).fill((1 - d) / N);
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        newRank[j] += d * transitionMatrix[i][j] * pageRank[i];
      }
    }
    pageRank = newRank;
  }

  // Betweenness Centrality (근사: 가중 최단경로 기반)
  // 정확한 BC는 O(N^3)이지만 N=45이면 충분히 빠름
  const betweenness = computeBetweennessCentrality(coMatrix, N);

  // 정규화
  const prValues = pageRank.slice(1, N + 1);
  const prMin = Math.min(...prValues);
  const prMax = Math.max(...prValues);
  const prRange = prMax - prMin || 1;

  const bcValues = betweenness.slice(1, N + 1);
  const bcMin = Math.min(...bcValues);
  const bcMax = Math.max(...bcValues);
  const bcRange = bcMax - bcMin || 1;

  // 최종 점수 = 70% PageRank + 30% Betweenness
  const scores = new Map<number, number>();
  for (let i = 1; i <= N; i++) {
    const normPR = (pageRank[i] - prMin) / prRange;
    const normBC = (betweenness[i] - bcMin) / bcRange;
    scores.set(i, normPR * 0.7 + normBC * 0.3);
  }

  return scores;
}

/**
 * Betweenness Centrality 계산 (Brandes 알고리즘 변형)
 * 가중치 = 1 / (coMatrix[i][j] + 1) — 동시출현이 많을수록 거리 짧음
 */
function computeBetweennessCentrality(coMatrix: number[][], N: number): number[] {
  const bc = new Array(N + 1).fill(0);

  for (let s = 1; s <= N; s++) {
    // Dijkstra-like BFS with weights
    const dist = new Array(N + 1).fill(Infinity);
    const sigma = new Array(N + 1).fill(0); // shortest path count
    const delta = new Array(N + 1).fill(0);
    const visited = new Array(N + 1).fill(false);
    const stack: number[] = [];

    dist[s] = 0;
    sigma[s] = 1;

    // Simple priority queue (N=45 so O(N^2) is fine)
    for (let iter = 0; iter < N; iter++) {
      // Find unvisited node with minimum distance
      let u = -1;
      let minDist = Infinity;
      for (let i = 1; i <= N; i++) {
        if (!visited[i] && dist[i] < minDist) {
          minDist = dist[i];
          u = i;
        }
      }
      if (u === -1) break;

      visited[u] = true;
      stack.push(u);

      for (let v = 1; v <= N; v++) {
        if (v === u || coMatrix[u][v] === 0) continue;
        const weight = 1 / (coMatrix[u][v] + 1);
        const newDist = dist[u] + weight;

        if (newDist < dist[v]) {
          dist[v] = newDist;
          sigma[v] = sigma[u];
        } else if (Math.abs(newDist - dist[v]) < 1e-10) {
          sigma[v] += sigma[u];
        }
      }
    }

    // Back-propagation of dependencies
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (let v = 1; v <= N; v++) {
        if (v === w || coMatrix[w][v] === 0) continue;
        const weight = 1 / (coMatrix[w][v] + 1);
        if (Math.abs(dist[w] - (dist[v] + weight)) < 1e-10) {
          // v is a predecessor of w
          if (sigma[w] > 0) {
            delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
          }
        }
      }
      if (w !== s) {
        bc[w] += delta[w];
      }
    }
  }

  // Normalize (undirected graph: divide by 2)
  for (let i = 1; i <= N; i++) {
    bc[i] /= 2;
  }

  return bc;
}
