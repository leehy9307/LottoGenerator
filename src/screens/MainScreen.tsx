import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GradientBackground from '../components/GradientBackground';
import GlassCard from '../components/GlassCard';
import NumberReveal from '../components/NumberReveal';
import SectionHeader from '../components/SectionHeader';
import FrequencyBar from '../components/FrequencyBar';
import LoadingAnimation from '../components/LoadingAnimation';
import { useLottoData } from '../hooks/useLottoData';
import { COLORS } from '../constants/colors';
import { APP_VERSION_DISPLAY, ENGINE_NAME, ENGINE_SUMMARY } from '../constants/appVersion';

const { width: SCREEN_W } = Dimensions.get('window');
const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 40) : 44;

const GAME_COLORS = ['#A78BFA', '#00C2FF', '#34D399', '#FBBF24', '#F87171'];

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function dataSourceLabel(source: string): { text: string; color: string } {
  switch (source) {
    case 'github': return { text: 'LIVE', color: COLORS.green };
    case 'api': return { text: 'LIVE', color: COLORS.green };
    case 'cache': return { text: 'CACHED', color: COLORS.cyan };
    default: return { text: 'OFFLINE', color: COLORS.gold };
  }
}

export default function MainScreen() {
  const { loading, refreshing, error, analysis, dataSource, triggerKey, refresh, regenerate } = useLottoData();

  const maxFreq = analysis
    ? Math.max(...analysis.allFrequencies.map(f => f.count))
    : 1;

  const sourceInfo = dataSourceLabel(dataSource);

  return (
    <GradientBackground>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: STATUS_BAR_HEIGHT + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Header ──────────────────────── */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.appTitle}>LOTTO</Text>
            <View style={styles.versionPill}>
              <Text style={styles.versionText}>{APP_VERSION_DISPLAY}</Text>
            </View>
          </View>
          <Text style={styles.appSubtitle}>
            {analysis
              ? `${analysis.drawRange.from} ~ ${analysis.drawRange.to}회 | ${analysis.totalDraws}회 분석`
              : 'AI-Powered Number Analysis'}
          </Text>
          <View style={styles.badgeRow}>
            {!loading && (
              <View style={[styles.badge, { borderColor: sourceInfo.color + '30' }]}>
                <View style={[styles.badgeDot, { backgroundColor: sourceInfo.color }]} />
                <Text style={[styles.badgeLabel, { color: sourceInfo.color }]}>{sourceInfo.text}</Text>
              </View>
            )}
            {analysis && (
              <View style={[styles.badge, { borderColor: 'rgba(255,255,255,0.08)' }]}>
                <Text style={styles.badgeLabelDim}>
                  Next: {analysis.nextDrawNo}회
                </Text>
              </View>
            )}
          </View>
        </View>

        {loading ? (
          <LoadingAnimation />
        ) : error ? (
          <GlassCard>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </GlassCard>
        ) : analysis ? (
          <>
            {/* ─── Expert Pick v10.0 — Dual Engine ──── */}
            <GlassCard accentColor={COLORS.expertAccent}>
              <SectionHeader
                title="EXPERT PICK"
                subtitle={`${ENGINE_NAME} ${APP_VERSION_DISPLAY} — 5 Games`}
                accentColor={COLORS.expertAccent}
                emoji="✨"
              />

              {analysis.expertPicks.map((pick, gameIdx) => {
                const isEV = pick.strategy.engine === 'ev-optimized';
                const isHybrid = pick.strategy.engine === 'hybrid';
                const engineColor = isEV ? COLORS.green : COLORS.cyan;
                const engineLabel = isEV ? 'EV' : 'HYBRID';

                return (
                <View key={`game-${gameIdx}-${triggerKey}`}>
                  {/* Game label */}
                  <View style={styles.gameLabelRow}>
                    <View style={[styles.gameBadge, { backgroundColor: GAME_COLORS[gameIdx] + '20', borderColor: GAME_COLORS[gameIdx] + '30' }]}>
                      <Text style={[styles.gameBadgeText, { color: GAME_COLORS[gameIdx] }]}>
                        GAME {String.fromCharCode(65 + gameIdx)}
                      </Text>
                    </View>
                    <View style={[styles.engineTag, { backgroundColor: engineColor + '18', borderColor: engineColor + '30' }]}>
                      <Text style={[styles.engineTagText, { color: engineColor }]}>{engineLabel}</Text>
                    </View>
                    <View style={styles.gameStatsInline}>
                      {isEV ? (
                        <>
                          <Text style={styles.gameStatText}>
                            비인기 {(pick.strategy.populationAvoidanceScore * 100).toFixed(0)}%
                          </Text>
                          <Text style={styles.gameStatDivider}>|</Text>
                          <Text style={styles.gameStatText}>
                            구조 {(pick.strategy.structuralFitScore * 100).toFixed(0)}%
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.gameStatText}>
                            패턴 {pick.strategy.patternIntelligenceScore != null ? (pick.strategy.patternIntelligenceScore * 100).toFixed(0) : '—'}%
                          </Text>
                          {pick.strategy.hybridPipelineScore != null && (
                            <>
                              <Text style={styles.gameStatDivider}>|</Text>
                              <Text style={styles.gameStatText}>
                                융합 {(pick.strategy.hybridPipelineScore * 100).toFixed(0)}%
                              </Text>
                            </>
                          )}
                          <Text style={styles.gameStatDivider}>|</Text>
                          <Text style={styles.gameStatText}>
                            구조 {(pick.strategy.structuralFitScore * 100).toFixed(0)}%
                          </Text>
                        </>
                      )}
                      <Text style={styles.gameStatDivider}>|</Text>
                      <Text style={styles.gameStatText}>
                        합 {pick.numbers.reduce((a, b) => a + b, 0)}
                      </Text>
                    </View>
                  </View>

                  <NumberReveal
                    numbers={pick.numbers}
                    triggerKey={triggerKey}
                  />

                  {gameIdx < analysis.expertPicks.length - 1 && (
                    <View style={styles.gameDivider} />
                  )}
                </View>
                );
              })}

              {/* Shared detail: use first game's strategy for EV info */}
              <View style={styles.divider} />
              <View style={styles.detailSection}>
                <InfoRow label="추정 공동당첨자" value={`${analysis.strategy.estimatedCoWinners.toFixed(1)}명`} />
                <InfoRow label="추정 1등 당첨금" value={analysis.strategy.estimatedJackpot} />
                <View style={styles.divider} />

                {/* Triple Engine Info */}
                <View style={styles.patternHeader}>
                  <Text style={styles.patternTitle}>{`TRIPLE ENGINE ${APP_VERSION_DISPLAY}`}</Text>
                </View>
                <InfoRow label="Game A,B,C" value="EV-Optimized (비인기도 극대화)" />
                <InfoRow label="Game D,E" value="Hybrid Intelligence (패턴+ML+PRNG)" />

                {/* NIST/PRNG 분석 결과 */}
                {analysis.hybridPipeline && (() => {
                  const hp = analysis.hybridPipeline;
                  const nistColor = hp.nistResult.verdict === 'random' ? COLORS.green
                    : hp.nistResult.verdict === 'suspicious' ? COLORS.gold : COLORS.red;
                  const verdictKr = hp.randomnessClassification === 'truly_random' ? '완전 무작위'
                    : hp.randomnessClassification === 'weakly_structured' ? '약한 구조 감지' : 'PRNG 탐지됨';
                  return (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.patternHeader}>
                        <Text style={styles.patternTitle}>RANDOMNESS ANALYSIS</Text>
                      </View>
                      <InfoRow label="NIST 테스트" value={`${hp.nistResult.passedCount}/${hp.nistResult.totalTests} 통과`} />
                      <InfoRow label="난수성 판정" value={verdictKr} highlight={hp.randomnessClassification !== 'truly_random'} />
                      <InfoRow label="PRNG 탐지" value={hp.prngResult.predictable ? `탐지: ${hp.prngResult.verdict}` : '미탐지'} />
                      {hp.mlPredictions && (
                        <InfoRow label="ML 앙상블" value={`신뢰도 ${(hp.mlPredictions.predictions.ensemble.confidence * 100).toFixed(0)}%`} />
                      )}
                      <InfoRow label="융합 전략" value={`수학 ${(hp.fusionWeights.prngMath * 100).toFixed(0)}% / ML ${(hp.fusionWeights.ml * 100).toFixed(0)}% / 패턴 ${(hp.fusionWeights.pattern * 100).toFixed(0)}% / 구조 ${(hp.fusionWeights.structural * 100).toFixed(0)}%`} />
                    </>
                  );
                })()}

                {/* Hybrid 게임(D,E)의 상세 정보 표시 */}
                {(() => {
                  const patternPick = analysis.expertPicks.find(p => p.strategy.engine === 'hybrid' || p.strategy.engine === 'pattern');
                  if (!patternPick?.strategy.patternDetails) return null;
                  const pd = patternPick.strategy.patternDetails;
                  return (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.patternHeader}>
                        <Text style={styles.patternTitle}>PATTERN ENGINE (GAME D,E)</Text>
                      </View>
                      <InfoRow label="마르코프 전이" value={`${(pd.markov * 100).toFixed(0)}%`} />
                      <InfoRow label="휴면 각성" value={`${(pd.dormancy * 100).toFixed(0)}%`} />
                      <InfoRow label="모멘텀" value={`${pd.momentum > 0 ? '+' : ''}${(pd.momentum * 100).toFixed(0)}%`} />
                      <InfoRow label="페어 친화도" value={`${(pd.pair * 100).toFixed(0)}%`} />
                      {pd.awakeningNumbers.length > 0 && (
                        <InfoRow label="각성 임박" value={pd.awakeningNumbers.join(', ')} highlight />
                      )}
                      {pd.risingNumbers.length > 0 && (
                        <InfoRow label="상승 추세" value={pd.risingNumbers.join(', ')} />
                      )}
                    </>
                  );
                })()}
                <View style={styles.divider} />

                <InfoRow label="5등 EV" value={`${analysis.strategy.expectedValueBreakdown.ev5.toFixed(0)}원`} />
                <InfoRow label="4등 EV" value={`${analysis.strategy.expectedValueBreakdown.ev4.toFixed(0)}원`} />
                <InfoRow label="3등 EV" value={`${analysis.strategy.expectedValueBreakdown.ev3.toFixed(1)}원`} />
                <InfoRow
                  label="기대값 합계 (게임당)"
                  value={`${analysis.strategy.expectedValue > 0 ? '+' : ''}${analysis.strategy.expectedValue}원`}
                  highlight={analysis.strategy.expectedValue > 0}
                />
              </View>

              {/* Reasoning */}
              <View style={styles.reasoningBox}>
                <Text style={styles.reasoningText}>{analysis.strategy.reasoning}</Text>
              </View>

              {/* Recommendation badge */}
              <View style={[styles.recBadge, { borderColor: recommendationColor(analysis.strategy.recommendation) + '25' }]}>
                <View style={[styles.recDot, { backgroundColor: recommendationColor(analysis.strategy.recommendation) }]} />
                <Text style={[styles.recText, { color: recommendationColor(analysis.strategy.recommendation) }]}>
                  {recommendationLabel(analysis.strategy.recommendation)}
                </Text>
              </View>

              {/* Generation time */}
              <Text style={styles.genTime}>{formatTime(analysis.generatedAt)}</Text>
            </GlassCard>

            {/* ─── Hot Numbers ──────────────── */}
            <GlassCard accentColor={COLORS.hotAccent}>
              <SectionHeader
                title="HOT NUMBERS"
                subtitle="가장 많이 나온 번호 Top 6"
                accentColor={COLORS.hotAccent}
                emoji="🔥"
              />
              <NumberReveal
                numbers={analysis.hotNumbers.map(h => h.number)}
                triggerKey={triggerKey}
              />
              <FrequencyBar
                data={analysis.hotNumbers}
                maxCount={maxFreq}
                accentColor={COLORS.hotAccent}
                triggerKey={triggerKey}
              />
            </GlassCard>

            {/* ─── Cold Numbers ─────────────── */}
            <GlassCard accentColor={COLORS.coldAccent}>
              <SectionHeader
                title="COLD NUMBERS"
                subtitle="가장 적게 나온 번호 Top 6"
                accentColor={COLORS.coldAccent}
                emoji="❄️"
              />
              <NumberReveal
                numbers={analysis.coldNumbers.map(c => c.number)}
                triggerKey={triggerKey}
              />
              <FrequencyBar
                data={analysis.coldNumbers}
                maxCount={maxFreq}
                accentColor={COLORS.coldAccent}
                triggerKey={triggerKey}
              />
            </GlassCard>

            {/* ─── Stats Card ──────────────── */}
            <GlassCard>
              <SectionHeader
                title="STATISTICS"
                subtitle="Chi-Square + NIST SP 800-22"
                accentColor={COLORS.textSecondary}
                emoji="📊"
              />
              <InfoRow
                label="카이제곱 p-value"
                value={analysis.chiSquareP.toFixed(4)}
              />
              <InfoRow
                label="분포 판정"
                value={analysis.isUniform ? '균일 분포 (p > 0.05)' : '편향 감지 (p ≤ 0.05)'}
              />
              {analysis.hybridPipeline && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.patternHeader}>
                    <Text style={styles.patternTitle}>NIST SP 800-22 TESTS</Text>
                  </View>
                  {analysis.hybridPipeline.nistResult.tests.map((test, idx) => (
                    <InfoRow
                      key={idx}
                      label={test.testName}
                      value={`p=${test.pValue.toFixed(4)} ${test.passed ? 'PASS' : 'FAIL'}`}
                      highlight={!test.passed}
                    />
                  ))}
                  <View style={styles.divider} />
                  <InfoRow
                    label="p-value 균일성"
                    value={analysis.hybridPipeline.nistResult.pValueUniformity.toFixed(4)}
                  />
                  <InfoRow
                    label="종합 판정"
                    value={analysis.hybridPipeline.nistResult.verdict === 'random' ? '무작위 (PASS)'
                      : analysis.hybridPipeline.nistResult.verdict === 'suspicious' ? '의심 (WARNING)' : '비무작위 (FAIL)'}
                    highlight={analysis.hybridPipeline.nistResult.verdict !== 'random'}
                  />
                </>
              )}
            </GlassCard>

            {/* ─── Action Buttons ──────────── */}
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={regenerate}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['rgba(167, 139, 250, 0.15)', 'rgba(0, 194, 255, 0.08)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
                />
                <Text style={styles.primaryBtnText}>번호 다시 생성</Text>
                <Text style={styles.btnHint}>{ENGINE_SUMMARY}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={refresh}
                activeOpacity={0.7}
                disabled={refreshing}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={COLORS.textSecondary} />
                ) : (
                  <>
                    <Text style={styles.secondaryBtnText}>데이터 새로고침</Text>
                    <Text style={styles.btnHint}>최신 당첨 데이터 가져오기</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {/* ─── Footer ──────────────────────── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            로또는 완전한 랜덤 게임입니다.{'\n'}
            AI 분석은 기대값 최적화 목적이며 당첨을 보장하지 않습니다.
          </Text>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.statChip, { borderColor: color + '18' }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[
        styles.infoValue,
        highlight && { color: COLORS.green, fontWeight: '700' },
      ]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function recommendationColor(rec: string): string {
  switch (rec) {
    case 'strong_buy': return COLORS.green;
    case 'buy': return '#86EFAC';
    case 'neutral': return COLORS.gold;
    default: return COLORS.red;
  }
}

function recommendationLabel(rec: string): string {
  switch (rec) {
    case 'strong_buy': return 'STRONG BUY';
    case 'buy': return 'BUY';
    case 'neutral': return 'NEUTRAL';
    default: return 'SKIP';
  }
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  appTitle: {
    fontSize: Math.min(32, SCREEN_W * 0.08),
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 6,
  },
  versionPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.18)',
  },
  versionText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.purple,
    letterSpacing: 0.5,
  },
  appSubtitle: {
    fontSize: 12,
    color: COLORS.textTertiary,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    gap: 5,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  badgeLabelDim: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.textTertiary,
    letterSpacing: 0.3,
  },

  // Error
  errorText: {
    color: COLORS.red,
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 14,
  },
  retryBtn: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  retryText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 9,
    color: COLORS.textTertiary,
    fontWeight: '500',
    marginTop: 3,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  // Game label
  gameLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  gameBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  gameBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  engineTag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  engineTagText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  gameStatsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  gameStatText: {
    fontSize: 10,
    color: COLORS.textTertiary,
    fontWeight: '500',
  },
  gameStatDivider: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.1)',
  },
  gameDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginTop: 4,
  },

  // Detail section
  detailSection: {
    marginTop: 10,
    gap: 3,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginVertical: 5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  infoLabel: {
    fontSize: 12,
    color: COLORS.textTertiary,
    fontWeight: '500',
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 8,
  },

  // Pattern Intelligence section
  patternHeader: {
    marginTop: 4,
    marginBottom: 2,
  },
  patternTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.purple,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Reasoning
  reasoningBox: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  reasoningText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  // Recommendation badge
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    gap: 8,
  },
  recDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  recText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // Generation time
  genTime: {
    textAlign: 'center',
    fontSize: 10,
    color: COLORS.textTertiary,
    marginTop: 10,
    letterSpacing: 0.3,
  },

  // Buttons
  buttonGroup: {
    paddingHorizontal: 16,
    marginTop: 14,
    gap: 10,
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
    overflow: 'hidden',
  },
  primaryBtnText: {
    color: COLORS.purple,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  secondaryBtnText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  btnHint: {
    color: COLORS.textTertiary,
    fontSize: 10,
    marginTop: 4,
    letterSpacing: 0.3,
  },

  // Footer
  footer: {
    marginTop: 28,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  footerText: {
    color: COLORS.textTertiary,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 17,
    letterSpacing: 0.2,
  },
});
