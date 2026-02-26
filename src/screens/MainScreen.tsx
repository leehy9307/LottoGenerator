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
import GradientBackground from '../components/GradientBackground';
import GlassCard from '../components/GlassCard';
import NumberReveal from '../components/NumberReveal';
import SectionHeader from '../components/SectionHeader';
import FrequencyBar from '../components/FrequencyBar';
import LoadingAnimation from '../components/LoadingAnimation';
import { useLottoData } from '../hooks/useLottoData';
import { COLORS } from '../constants/colors';

const { width: SCREEN_W } = Dimensions.get('window');
const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 40) : 44;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function dataSourceLabel(source: string): { text: string; color: string } {
  switch (source) {
    case 'github': return { text: '온라인 데이터', color: '#4CAF50' };
    case 'api': return { text: '실시간 데이터', color: '#4CAF50' };
    case 'cache': return { text: '캐시 데이터', color: '#2196F3' };
    default: return { text: '오프라인 데이터', color: COLORS.gold };
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
        contentContainerStyle={[styles.scrollContent, { paddingTop: STATUS_BAR_HEIGHT + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appTitle}>LOTTO GENERATOR</Text>
          <Text style={styles.appSubtitle}>
            {analysis
              ? `${analysis.drawRange.from}회 ~ ${analysis.drawRange.to}회 분석 (${analysis.totalDraws}회)`
              : '로또 6/45 통계 분석'}
          </Text>
          <View style={styles.badgeRow}>
            {!loading && (
              <View style={[styles.badge, { borderColor: sourceInfo.color + '50' }]}>
                <View style={[styles.badgeDot, { backgroundColor: sourceInfo.color }]} />
                <Text style={[styles.badgeText, { color: sourceInfo.color }]}>{sourceInfo.text}</Text>
              </View>
            )}
            {analysis && (
              <View style={[styles.badge, { borderColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={styles.badgeTextDim}>
                  다음 추첨: {analysis.nextDrawNo}회
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
            {/* Hot Numbers */}
            <GlassCard accentColor={COLORS.hotAccent}>
              <SectionHeader
                title="HOT NUMBERS"
                subtitle="가장 많이 나온 번호 6개"
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

            {/* Cold Numbers */}
            <GlassCard accentColor={COLORS.coldAccent}>
              <SectionHeader
                title="COLD NUMBERS"
                subtitle="가장 적게 나온 번호 6개"
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

            {/* Expert Pick v6.0 */}
            <GlassCard accentColor={COLORS.expertAccent}>
              <SectionHeader
                title="EXPERT PICK v6.0"
                subtitle="Game Theory + MCMC Sampler"
                accentColor={COLORS.expertAccent}
                emoji="✨"
              />
              <NumberReveal
                numbers={analysis.expertPick}
                triggerKey={triggerKey}
              />
              <View style={styles.expertInfo}>
                <InfoRow label="알고리즘" value={`v${analysis.strategy.algorithmVersion}`} />
                <InfoRow
                  label="비인기 회피율"
                  value={`${(analysis.strategy.populationAvoidanceScore * 100).toFixed(0)}%`}
                />
                <InfoRow
                  label="구조 적합도"
                  value={`${(analysis.strategy.structuralFitScore * 100).toFixed(0)}%`}
                />
                <InfoRow
                  label="MCMC 수렴"
                  value={isNaN(analysis.strategy.mcmcConvergence) ? 'Rejection' : `R-hat ${analysis.strategy.mcmcConvergence.toFixed(2)}`}
                />
                <InfoRow
                  label="합계"
                  value={`${analysis.expertPick.reduce((a, b) => a + b, 0)}`}
                />
                <InfoRow
                  label="홀:짝"
                  value={`${analysis.expertPick.filter(n => n % 2 === 1).length}:${analysis.expertPick.filter(n => n % 2 === 0).length}`}
                />
                <InfoRow
                  label="추정 공동당첨자"
                  value={`${analysis.strategy.estimatedCoWinners.toFixed(1)}명`}
                />
                <InfoRow
                  label="5등 EV"
                  value={`${analysis.strategy.expectedValueBreakdown.ev5.toFixed(0)}원`}
                />
                <InfoRow
                  label="4등 EV"
                  value={`${analysis.strategy.expectedValueBreakdown.ev4.toFixed(0)}원`}
                />
                <InfoRow
                  label="3등 EV"
                  value={`${analysis.strategy.expectedValueBreakdown.ev3.toFixed(1)}원`}
                />
                <InfoRow
                  label="기대값 합계"
                  value={`${analysis.strategy.expectedValue > 0 ? '+' : ''}${analysis.strategy.expectedValue}원/게임`}
                />
                <InfoRow
                  label="추정 1등"
                  value={analysis.strategy.estimatedJackpot}
                />
                <InfoRow
                  label="생성 시각"
                  value={formatTime(analysis.generatedAt)}
                />
              </View>
              <View style={styles.reasoningBox}>
                <Text style={styles.reasoningText}>{analysis.strategy.reasoning}</Text>
              </View>
              <View style={styles.strategyBadge}>
                <Text style={[
                  styles.strategyBadgeText,
                  { color: recommendationColor(analysis.strategy.recommendation) }
                ]}>
                  {recommendationLabel(analysis.strategy.recommendation)}
                </Text>
              </View>
            </GlassCard>

            {/* Stats */}
            <GlassCard>
              <SectionHeader
                title="통계 정보"
                subtitle="카이제곱 균일성 검정"
                accentColor={COLORS.textSecondary}
                emoji="📊"
              />
              <InfoRow
                label="χ² 검정 p-value"
                value={analysis.chiSquareP.toFixed(4)}
              />
              <InfoRow
                label="균일 분포"
                value={analysis.isUniform ? '균일함 (p > 0.05)' : '편향 감지 (p <= 0.05)'}
              />
            </GlassCard>

            {/* 새로고침 버튼 (데이터 강제 갱신) */}
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={refresh}
              activeOpacity={0.7}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={COLORS.coldAccent} />
              ) : (
                <Text style={styles.refreshText}>🔄  데이터 새로고침</Text>
              )}
              <Text style={styles.refreshHint}>API에서 최신 당첨 데이터를 다시 가져옵니다</Text>
            </TouchableOpacity>

            {/* 번호 재생성 버튼 (시간 엔트로피만 갱신) */}
            <TouchableOpacity style={styles.regenerateBtn} onPress={regenerate} activeOpacity={0.7}>
              <Text style={styles.regenerateText}>🎲  번호 다시 생성</Text>
              <Text style={styles.regenerateHint}>Game Theory + MCMC Sampler로 재생성합니다</Text>
            </TouchableOpacity>
          </>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            로또는 완전한 랜덤 게임입니다. AI 분석 및 게임이론 전략은{'\n'}기대값 최적화 목적이며 당첨을 보장하지 않습니다.
          </Text>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

function recommendationColor(rec: string): string {
  switch (rec) {
    case 'strong_buy': return '#4CAF50';
    case 'buy': return '#8BC34A';
    case 'neutral': return COLORS.gold;
    default: return '#FF6B6B';
  }
}

function recommendationLabel(rec: string): string {
  switch (rec) {
    case 'strong_buy': return 'STRONG BUY — 기대값 양수 구간';
    case 'buy': return 'BUY — 이월로 기대값 개선';
    case 'neutral': return 'NEUTRAL — 일반 구매 구간';
    default: return 'SKIP — 기대값 불리';
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  appTitle: {
    fontSize: Math.min(28, SCREEN_W * 0.07),
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 3,
  },
  appSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    gap: 5,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badgeTextDim: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textTertiary,
  },
  errorText: {
    color: '#FF6B6B',
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 12,
  },
  retryBtn: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  retryText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  expertInfo: {
    marginTop: 12,
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
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
  refreshBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 180, 216, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 180, 216, 0.25)',
    alignItems: 'center',
  },
  refreshText: {
    color: COLORS.coldAccent,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  refreshHint: {
    color: COLORS.textTertiary,
    fontSize: 10,
    marginTop: 4,
  },
  regenerateBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(212, 160, 23, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.25)',
    alignItems: 'center',
  },
  regenerateText: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  regenerateHint: {
    color: COLORS.textTertiary,
    fontSize: 10,
    marginTop: 4,
  },
  reasoningBox: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  reasoningText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  strategyBadge: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  strategyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 24,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  footerText: {
    color: COLORS.textTertiary,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 18,
  },
});
