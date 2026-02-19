import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { COLORS } from '../constants/colors';

export default function LoadingAnimation() {
  const dots = [0, 1, 2];

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        {dots.map(i => (
          <Dot key={i} index={i} />
        ))}
      </View>
      <Text style={styles.text}>데이터 분석 중...</Text>
    </View>
  );
}

function Dot({ index }: { index: number }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    const delay = index * 200;
    scale.value = withDelay(
      delay,
      withRepeat(
        withTiming(1.2, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.gold,
  },
  text: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});
