import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

interface Props {
  children: React.ReactNode;
}

export default function GradientBackground({ children }: Props) {
  const mesh1X = useSharedValue(0);
  const mesh1Y = useSharedValue(0);
  const mesh2X = useSharedValue(0);
  const mesh2Y = useSharedValue(0);
  const mesh3X = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    mesh1X.value = withRepeat(withTiming(50, { duration: 12000, easing: ease }), -1, true);
    mesh1Y.value = withRepeat(withTiming(35, { duration: 14000, easing: ease }), -1, true);
    mesh2X.value = withRepeat(withTiming(-40, { duration: 10000, easing: ease }), -1, true);
    mesh2Y.value = withRepeat(withTiming(-45, { duration: 13000, easing: ease }), -1, true);
    mesh3X.value = withRepeat(withTiming(30, { duration: 11000, easing: ease }), -1, true);
  }, []);

  const mesh1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: mesh1X.value }, { translateY: mesh1Y.value }],
  }));

  const mesh2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: mesh2X.value }, { translateY: mesh2Y.value }],
  }));

  const mesh3Style = useAnimatedStyle(() => ({
    transform: [{ translateX: mesh3X.value }],
  }));

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#06080F', '#0C1020', '#080A14', '#06080F']}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Mesh gradient blobs */}
      <Animated.View style={[styles.mesh, styles.mesh1, mesh1Style]}>
        <LinearGradient
          colors={['rgba(100, 60, 255, 0.22)', 'rgba(100, 60, 255, 0.0)']}
          style={styles.meshGradient}
          start={{ x: 0.3, y: 0.3 }}
          end={{ x: 0.8, y: 0.8 }}
        />
      </Animated.View>
      <Animated.View style={[styles.mesh, styles.mesh2, mesh2Style]}>
        <LinearGradient
          colors={['rgba(0, 194, 255, 0.15)', 'rgba(0, 194, 255, 0.0)']}
          style={styles.meshGradient}
          start={{ x: 0.2, y: 0.2 }}
          end={{ x: 0.9, y: 0.9 }}
        />
      </Animated.View>
      <Animated.View style={[styles.mesh, styles.mesh3, mesh3Style]}>
        <LinearGradient
          colors={['rgba(255, 95, 58, 0.10)', 'rgba(255, 95, 58, 0.0)']}
          style={styles.meshGradient}
          start={{ x: 0.5, y: 0.2 }}
          end={{ x: 0.8, y: 0.9 }}
        />
      </Animated.View>
      {/* Subtle noise overlay for texture */}
      <View style={styles.noiseOverlay} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#06080F',
  },
  mesh: {
    position: 'absolute',
    borderRadius: 999,
    overflow: 'hidden',
  },
  meshGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  mesh1: {
    width: width * 1.0,
    height: width * 1.0,
    top: -width * 0.3,
    left: -width * 0.15,
  },
  mesh2: {
    width: width * 0.8,
    height: width * 0.8,
    bottom: height * 0.05,
    right: -width * 0.2,
  },
  mesh3: {
    width: width * 0.6,
    height: width * 0.6,
    top: height * 0.45,
    left: -width * 0.1,
  },
  noiseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.008)',
  },
});
