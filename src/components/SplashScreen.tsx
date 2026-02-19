import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  withSequence,
  Easing,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import { COLORS } from '../constants/colors';

const { width, height } = Dimensions.get('window');

// 스플래시에 보여줄 데코 로또볼 색상
const DECO_BALLS = [
  { color: '#FFC107', num: 7 },
  { color: '#2196F3', num: 14 },
  { color: '#F44336', num: 27 },
  { color: '#9E9E9E', num: 33 },
  { color: '#4CAF50', num: 42 },
];

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  // 메인 애니메이션 진행도 (0→1)
  const progress = useSharedValue(0);
  // 타이틀
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(30);
  // 서브타이틀
  const subOpacity = useSharedValue(0);
  // 로고 영역
  const logoScale = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);
  // 로딩 바
  const barWidth = useSharedValue(0);
  // 페이드 아웃
  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    // 로고 등장
    logoScale.value = withDelay(200, withSpring(1, { damping: 10, stiffness: 120 }));
    logoOpacity.value = withDelay(200, withTiming(1, { duration: 500 }));

    // 타이틀 등장
    titleOpacity.value = withDelay(600, withTiming(1, { duration: 500 }));
    titleY.value = withDelay(600, withSpring(0, { damping: 14, stiffness: 100 }));

    // 서브타이틀 등장
    subOpacity.value = withDelay(1000, withTiming(1, { duration: 400 }));

    // 로딩 바 진행
    barWidth.value = withDelay(800, withTiming(100, {
      duration: 1800,
      easing: Easing.out(Easing.cubic),
    }));

    // 페이드 아웃 후 완료
    screenOpacity.value = withDelay(2800, withTiming(0, { duration: 400 }, (finished) => {
      if (finished) {
        runOnJS(onFinish)();
      }
    }));
  }, []);

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));

  const subStyle = useAnimatedStyle(() => ({
    opacity: subOpacity.value,
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%` as any,
  }));

  return (
    <Animated.View style={[styles.container, screenStyle]}>
      <LinearGradient
        colors={['#0D0B1A', '#160E2C', '#1A0F30', '#0D0B1A']}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.3, 0.7, 1]}
      />

      {/* 배경 오브 */}
      <View style={styles.orbContainer}>
        <View style={[styles.bgOrb, styles.orbPurple]}>
          <LinearGradient
            colors={['rgba(123, 47, 190, 0.5)', 'rgba(91, 33, 182, 0.0)']}
            style={styles.orbFill}
            start={{ x: 0.3, y: 0.3 }}
            end={{ x: 1, y: 1 }}
          />
        </View>
        <View style={[styles.bgOrb, styles.orbGold]}>
          <LinearGradient
            colors={['rgba(212, 160, 23, 0.35)', 'rgba(184, 134, 11, 0.0)']}
            style={styles.orbFill}
            start={{ x: 0.3, y: 0.3 }}
            end={{ x: 1, y: 1 }}
          />
        </View>
      </View>

      {/* 메인 컨텐츠 */}
      <View style={styles.content}>
        {/* 로또볼 데코 링 */}
        <Animated.View style={[styles.logoArea, logoStyle]}>
          <View style={styles.ballRing}>
            {DECO_BALLS.map((ball, i) => (
              <DecoBall key={i} ball={ball} index={i} />
            ))}
          </View>
          <View style={styles.centerIcon}>
            <Text style={styles.centerEmoji}>🎱</Text>
          </View>
        </Animated.View>

        {/* 타이틀 */}
        <Animated.View style={titleStyle}>
          <Text style={styles.title}>LOTTO</Text>
          <Text style={styles.titleAccent}>GENERATOR</Text>
        </Animated.View>

        {/* 서브타이틀 */}
        <Animated.View style={subStyle}>
          <Text style={styles.subtitle}>통계 기반 번호 분석</Text>
        </Animated.View>
      </View>

      {/* 하단 로딩 바 */}
      <View style={styles.bottomArea}>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, barStyle]} />
        </View>
        <Text style={styles.loadingText}>데이터 분석 준비 중...</Text>
      </View>
    </Animated.View>
  );
}

function DecoBall({ ball, index }: { ball: typeof DECO_BALLS[0]; index: number }) {
  const scale = useSharedValue(0);
  const ballSize = 36;

  useEffect(() => {
    scale.value = withDelay(
      300 + index * 100,
      withSpring(1, { damping: 10, stiffness: 150 })
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value,
  }));

  // 원형으로 배치 (5개를 상단 반원에)
  const angle = -90 + (index - 2) * 36; // -162, -126, -90, -54, -18
  const radius = 56;
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad) * radius;
  const y = Math.sin(rad) * radius;

  return (
    <Animated.View
      style={[
        styles.decoBall,
        {
          width: ballSize,
          height: ballSize,
          borderRadius: ballSize / 2,
          backgroundColor: ball.color,
          transform: [{ translateX: x }, { translateY: y }],
        },
        style,
      ]}
    >
      <Text style={styles.decoBallText}>{ball.num}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  bgOrb: {
    position: 'absolute',
    borderRadius: 999,
    overflow: 'hidden',
  },
  orbFill: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  orbPurple: {
    width: width * 0.9,
    height: width * 0.9,
    top: height * 0.08,
    left: -width * 0.25,
  },
  orbGold: {
    width: width * 0.7,
    height: width * 0.7,
    bottom: height * 0.1,
    right: -width * 0.2,
  },
  content: {
    alignItems: 'center',
    marginTop: -height * 0.05,
  },
  logoArea: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  ballRing: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  decoBall: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  decoBallText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  centerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerEmoji: {
    fontSize: 30,
  },
  title: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 8,
    textAlign: 'center',
  },
  titleAccent: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.gold,
    letterSpacing: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 16,
    letterSpacing: 2,
  },
  bottomArea: {
    position: 'absolute',
    bottom: height * 0.1,
    width: width * 0.6,
    alignItems: 'center',
  },
  barTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: COLORS.gold,
  },
  loadingText: {
    color: COLORS.textTertiary,
    fontSize: 11,
    marginTop: 10,
    letterSpacing: 1,
  },
});
