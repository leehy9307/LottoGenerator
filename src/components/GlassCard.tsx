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
    <View style={[styles.container, style]}>
      {Platform.OS === 'android' ? (
        <View style={[StyleSheet.absoluteFill, styles.androidBg]} />
      ) : (
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      <View style={StyleSheet.absoluteFill}>
        <View
          style={[
            styles.border,
            accentColor ? { borderColor: accentColor + '30' } : null,
          ]}
        />
      </View>
      {accentColor && (
        <View
          style={[
            styles.accentGlow,
            { backgroundColor: accentColor, shadowColor: accentColor },
          ]}
        />
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginVertical: 8,
  },
  androidBg: {
    backgroundColor: 'rgba(20, 16, 40, 0.85)',
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  accentGlow: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    opacity: 0.6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  content: {
    padding: 20,
  },
});
