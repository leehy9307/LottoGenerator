import React from 'react';
import { StyleSheet, View, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS } from '../constants/colors';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  accentColor?: string;
}

export default function GlassCard({ children, style, accentColor }: Props) {
  return (
    <View style={[styles.outer, style]}>
      <View style={styles.container}>
        {Platform.OS === 'android' ? (
          <View style={[StyleSheet.absoluteFill, styles.androidBg]} />
        ) : (
          <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        {/* Top edge highlight */}
        <View style={styles.topHighlight} />
        {/* Accent glow line */}
        {accentColor && (
          <View
            style={[
              styles.accentLine,
              {
                backgroundColor: accentColor,
                shadowColor: accentColor,
              },
            ]}
          />
        )}
        {/* Border */}
        <View
          style={[
            styles.border,
            accentColor ? { borderColor: accentColor + '18' } : null,
          ]}
        />
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  container: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  androidBg: {
    backgroundColor: 'rgba(12, 15, 30, 0.88)',
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 32,
    right: 32,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    left: 40,
    right: 40,
    height: 2,
    borderRadius: 1,
    opacity: 0.5,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  content: {
    padding: 22,
  },
});
