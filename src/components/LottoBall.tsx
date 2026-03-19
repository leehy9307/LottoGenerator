import React from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getBallStyle } from '../constants/ballColors';

const { width: SCREEN_W } = Dimensions.get('window');
const DEFAULT_SIZE = Math.min(Math.floor((SCREEN_W - 80) / 6), 52);

interface Props {
  number: number;
  size?: number;
}

export default function LottoBall({ number, size = DEFAULT_SIZE }: Props) {
  const style = getBallStyle(number);
  const fontSize = size * 0.38;

  return (
    <View
      style={[
        styles.ball,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          shadowColor: style.shadow,
        },
      ]}
    >
      {/* Main gradient */}
      <LinearGradient
        colors={[style.background, style.gradientEnd]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />
      {/* Inner glow / shine */}
      <View
        style={[
          styles.shine,
          {
            width: size * 0.55,
            height: size * 0.22,
            borderRadius: size * 0.2,
            top: size * 0.1,
          },
        ]}
      />
      {/* Subtle ring */}
      <View
        style={[
          styles.ring,
          {
            width: size - 2,
            height: size - 2,
            borderRadius: (size - 2) / 2,
          },
        ]}
      />
      <Text
        style={[
          styles.number,
          {
            fontSize,
            color: style.text,
            textShadowColor: 'rgba(0,0,0,0.2)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2,
          },
        ]}
      >
        {number}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ball: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  shine: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.30)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  number: {
    fontWeight: '800',
    textAlign: 'center',
  },
});
