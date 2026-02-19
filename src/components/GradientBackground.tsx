import React from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';

const { width, height } = Dimensions.get('window');

interface Props {
  children: React.ReactNode;
}

export default function GradientBackground({ children }: Props) {
  const orb1X = useSharedValue(0);
  const orb1Y = useSharedValue(0);
  const orb2X = useSharedValue(0);
  const orb2Y = useSharedValue(0);

  useEffect(() => {
    const duration = 8000;
    const easing = Easing.inOut(Easing.sin);

    orb1X.value = withRepeat(withTiming(40, { duration, easing }), -1, true);
    orb1Y.value = withRepeat(withTiming(30, { duration: duration * 1.2, easing }), -1, true);
    orb2X.value = withRepeat(withTiming(-30, { duration: duration * 0.9, easing }), -1, true);
    orb2Y.value = withRepeat(withTiming(-40, { duration: duration * 1.1, easing }), -1, true);
  }, []);

  const orb1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: orb1X.value },
      { translateY: orb1Y.value },
    ],
  }));

  const orb2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: orb2X.value },
      { translateY: orb2Y.value },
    ],
  }));

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0D0B1A', '#1A0F2E', '#0D0B1A']}
        style={StyleSheet.absoluteFill}
      />
      {/* Purple orb */}
      <Animated.View style={[styles.orb, styles.orb1, orb1Style]}>
        <LinearGradient
          colors={['rgba(123, 47, 190, 0.4)', 'rgba(91, 33, 182, 0.1)']}
          style={styles.orbGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
      {/* Gold orb */}
      <Animated.View style={[styles.orb, styles.orb2, orb2Style]}>
        <LinearGradient
          colors={['rgba(212, 160, 23, 0.3)', 'rgba(184, 134, 11, 0.05)']}
          style={styles.orbGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
      {/* Blue orb */}
      <View style={[styles.orb, styles.orb3]}>
        <LinearGradient
          colors={['rgba(30, 64, 175, 0.3)', 'rgba(37, 99, 235, 0.05)']}
          style={styles.orbGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0B1A',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    overflow: 'hidden',
  },
  orbGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  orb1: {
    width: width * 0.8,
    height: width * 0.8,
    top: -width * 0.2,
    left: -width * 0.2,
  },
  orb2: {
    width: width * 0.6,
    height: width * 0.6,
    bottom: height * 0.1,
    right: -width * 0.15,
  },
  orb3: {
    width: width * 0.5,
    height: width * 0.5,
    top: height * 0.4,
    left: -width * 0.1,
  },
});
