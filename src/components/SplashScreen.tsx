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
} from 'react-native-reanimated';
import { COLORS } from '../constants/colors';

const { width, height } = Dimensions.get('window');

const DECO_BALLS = [
  { color: '#FFBE2E', gradEnd: '#FF9500', num: 7 },
  { color: '#3B82F6', gradEnd: '#1D4ED8', num: 14 },
  { color: '#EF4444', gradEnd: '#DC2626', num: 27 },
  { color: '#8B8FA3', gradEnd: '#64687A', num: 33 },
  { color: '#22C55E', gradEnd: '#16A34A', num: 42 },
];

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  const logoScale = useSharedValue(0.2);
  const logoOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(20);
  const subOpacity = useSharedValue(0);
  const barWidth = useSharedValue(0);
  const screenOpacity = useSharedValue(1);
  const versionOpacity = useSharedValue(0);

  useEffect(() => {
    // Logo entrance
    logoScale.value = withDelay(200, withSpring(1, { damping: 12, stiffness: 100 }));
    logoOpacity.value = withDelay(200, withTiming(1, { duration: 600 }));

    // Title
    titleOpacity.value = withDelay(600, withTiming(1, { duration: 500 }));
    titleY.value = withDelay(600, withSpring(0, { damping: 16, stiffness: 100 }));

    // Subtitle & version
    subOpacity.value = withDelay(900, withTiming(1, { duration: 400 }));
    versionOpacity.value = withDelay(1100, withTiming(1, { duration: 400 }));

    // Loading bar
    barWidth.value = withDelay(700, withTiming(100, {
      duration: 1800,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    }));

    // Fade out
    screenOpacity.value = withDelay(2800, withTiming(0, { duration: 350 }, (finished) => {
      if (finished) runOnJS(onFinish)();
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

  const subStyle = useAnimatedStyle(() => ({ opacity: subOpacity.value }));
  const versionStyle = useAnimatedStyle(() => ({ opacity: versionOpacity.value }));

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%` as any,
  }));

  return (
    <Animated.View style={[styles.container, screenStyle]}>
      <LinearGradient
        colors={['#06080F', '#0C1020', '#0F1328', '#06080F']}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.35, 0.65, 1]}
      />

      {/* Background mesh */}
      <View style={styles.meshContainer}>
        <View style={[styles.bgMesh, styles.meshPurple]}>
          <LinearGradient
            colors={['rgba(100, 60, 255, 0.35)', 'rgba(100, 60, 255, 0.0)']}
            style={styles.meshFill}
            start={{ x: 0.3, y: 0.3 }}
            end={{ x: 1, y: 1 }}
          />
        </View>
        <View style={[styles.bgMesh, styles.meshCyan]}>
          <LinearGradient
            colors={['rgba(0, 194, 255, 0.20)', 'rgba(0, 194, 255, 0.0)']}
            style={styles.meshFill}
            start={{ x: 0.3, y: 0.3 }}
            end={{ x: 1, y: 1 }}
          />
        </View>
      </View>

      <View style={styles.content}>
        {/* Logo area with balls */}
        <Animated.View style={[styles.logoArea, logoStyle]}>
          <View style={styles.ballRing}>
            {DECO_BALLS.map((ball, i) => (
              <DecoBall key={i} ball={ball} index={i} />
            ))}
          </View>
          <View style={styles.centerIcon}>
            <LinearGradient
              colors={['rgba(167, 139, 250, 0.20)', 'rgba(167, 139, 250, 0.05)']}
              style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
            />
            <Text style={styles.centerEmoji}>🎱</Text>
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View style={titleStyle}>
          <Text style={styles.title}>LOTTO</Text>
          <Text style={styles.titleAccent}>GENERATOR</Text>
        </Animated.View>

        {/* Subtitle */}
        <Animated.View style={subStyle}>
          <Text style={styles.subtitle}>AI-Powered Number Analysis</Text>
        </Animated.View>

        {/* Version badge */}
        <Animated.View style={[styles.versionBadge, versionStyle]}>
          <Text style={styles.versionText}>v10.0</Text>
        </Animated.View>
      </View>

      {/* Bottom loading */}
      <View style={styles.bottomArea}>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, barStyle]}>
            <LinearGradient
              colors={['#A78BFA', '#00C2FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 2 }]}
            />
          </Animated.View>
        </View>
        <Text style={styles.loadingText}>Analyzing lottery data...</Text>
      </View>
    </Animated.View>
  );
}

function DecoBall({ ball, index }: { ball: typeof DECO_BALLS[0]; index: number }) {
  const scale = useSharedValue(0);
  const ballSize = 34;

  useEffect(() => {
    scale.value = withDelay(
      400 + index * 80,
      withSequence(
        withSpring(1.15, { damping: 8, stiffness: 160 }),
        withSpring(1, { damping: 12, stiffness: 150 }),
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value,
  }));

  const angle = -90 + (index - 2) * 36;
  const radius = 58;
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
          transform: [{ translateX: x }, { translateY: y }],
        },
        style,
      ]}
    >
      <LinearGradient
        colors={[ball.color, ball.gradEnd]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: ballSize / 2 }]}
      />
      <View style={[styles.decoBallShine, { width: ballSize * 0.5, height: ballSize * 0.2, borderRadius: ballSize * 0.15 }]} />
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
  meshContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  bgMesh: {
    position: 'absolute',
    borderRadius: 999,
    overflow: 'hidden',
  },
  meshFill: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  meshPurple: {
    width: width * 0.9,
    height: width * 0.9,
    top: height * 0.1,
    left: -width * 0.25,
  },
  meshCyan: {
    width: width * 0.7,
    height: width * 0.7,
    bottom: height * 0.1,
    right: -width * 0.2,
  },
  content: {
    alignItems: 'center',
    marginTop: -height * 0.03,
  },
  logoArea: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 36,
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
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  decoBallShine: {
    position: 'absolute',
    top: '12%',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  decoBallText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  centerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.20)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  centerEmoji: {
    fontSize: 26,
  },
  title: {
    fontSize: 44,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 10,
    textAlign: 'center',
  },
  titleAccent: {
    fontSize: 18,
    fontWeight: '500',
    color: COLORS.purple,
    letterSpacing: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textTertiary,
    marginTop: 16,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  versionBadge: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(167, 139, 250, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
  },
  versionText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.purple,
    letterSpacing: 1,
  },
  bottomArea: {
    position: 'absolute',
    bottom: height * 0.1,
    width: width * 0.5,
    alignItems: 'center',
  },
  barTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  loadingText: {
    color: COLORS.textTertiary,
    fontSize: 10,
    marginTop: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
