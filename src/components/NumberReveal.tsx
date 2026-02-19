import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import LottoBall from './LottoBall';

const { width: SCREEN_W } = Dimensions.get('window');
const BALL_SIZE = Math.min(Math.floor((SCREEN_W - 80) / 6), 52);
const BALL_GAP = Math.max(Math.floor((SCREEN_W - 80 - BALL_SIZE * 6) / 5), 4);

interface Props {
  numbers: number[];
  triggerKey: number;
}

const SPRING_CONFIG = {
  damping: 12,
  stiffness: 150,
  mass: 0.8,
};

function AnimatedBall({ number, index, triggerKey }: { number: number; index: number; triggerKey: number }) {
  const scale = useSharedValue(0);
  const translateY = useSharedValue(30);

  useEffect(() => {
    scale.value = 0;
    translateY.value = 30;

    const delay = index * 120;
    scale.value = withDelay(delay, withSpring(1, SPRING_CONFIG));
    translateY.value = withDelay(delay, withSpring(0, SPRING_CONFIG));
  }, [triggerKey]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
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
    paddingVertical: 14,
  },
});
