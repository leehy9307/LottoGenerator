import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { COLORS } from '../constants/colors';

export default function LoadingAnimation() {
  return (
    <View style={styles.container}>
      <View style={styles.pulseContainer}>
        <PulseRing delay={0} />
        <PulseRing delay={400} />
        <PulseRing delay={800} />
        <View style={styles.centerDot} />
      </View>
      <Text style={styles.text}>AI 분석 중</Text>
      <View style={styles.dotsRow}>
        {[0, 1, 2].map(i => (
          <Dot key={i} index={i} />
        ))}
      </View>
    </View>
  );
}

function PulseRing({ delay }: { delay: number }) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withDelay(delay,
      withRepeat(
        withTiming(1.8, { duration: 1800, easing: Easing.out(Easing.cubic) }),
        -1, false,
      ),
    );
    opacity.value = withDelay(delay,
      withRepeat(
        withTiming(0, { duration: 1800, easing: Easing.out(Easing.cubic) }),
        -1, false,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.ring, style]} />;
}

function Dot({ index }: { index: number }) {
  const opacity = useSharedValue(0.2);

  useEffect(() => {
    opacity.value = withDelay(
      index * 250,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.2, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, false,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  pulseContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  ring: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: COLORS.purple,
  },
  centerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.purple,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.textSecondary,
  },
  text: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1,
  },
});
