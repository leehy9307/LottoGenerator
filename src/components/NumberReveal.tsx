import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import LottoBall from './LottoBall';

const { width: SCREEN_W } = Dimensions.get('window');
const BALL_SIZE = Math.min(Math.floor((SCREEN_W - 80) / 6), 52);
const BALL_GAP = Math.max(Math.floor((SCREEN_W - 80 - BALL_SIZE * 6) / 5), 6);

interface Props {
  numbers: number[];
  triggerKey: number;
}

const SPRING_CONFIG = {
  damping: 14,
  stiffness: 180,
  mass: 0.6,
};

function AnimatedBall({ number, index, triggerKey }: { number: number; index: number; triggerKey: number }) {
  const scale = useSharedValue(0);
  const translateY = useSharedValue(24);
  const rotate = useSharedValue(0);

  useEffect(() => {
    scale.value = 0;
    translateY.value = 24;
    rotate.value = 0;

    const delay = index * 100;
    scale.value = withDelay(
      delay,
      withSequence(
        withSpring(1.12, { ...SPRING_CONFIG, stiffness: 200 }),
        withSpring(1, SPRING_CONFIG),
      ),
    );
    translateY.value = withDelay(delay, withSpring(0, SPRING_CONFIG));
    rotate.value = withDelay(
      delay,
      withSequence(
        withTiming(-3, { duration: 80 }),
        withSpring(0, { damping: 10, stiffness: 200 }),
      ),
    );
  }, [triggerKey]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: scale.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <LottoBall number={number} size={BALL_SIZE} />
    </Animated.View>
  );
}

export default function NumberReveal({ numbers, triggerKey }: Props) {
  return (
    <View style={[styles.container, { gap: BALL_GAP }]}>
      {numbers.map((num, idx) => (
        <AnimatedBall key={`${num}-${idx}`} number={num} index={idx} triggerKey={triggerKey} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
});
