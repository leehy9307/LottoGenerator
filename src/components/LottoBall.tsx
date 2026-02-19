import React from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import { getBallStyle } from '../constants/ballColors';

const { width: SCREEN_W } = Dimensions.get('window');
// 6볼 + gap 기준 최대 볼 크기 (화면폭의 ~13%, gap 고려)
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
          backgroundColor: style.background,
          shadowColor: style.shadow,
        },
      ]}
    >
      <View
        style={[
          styles.shine,
          {
            width: size * 0.65,
            height: size * 0.3,
            borderRadius: size * 0.3,
            top: size * 0.07,
          },
        ]}
      />
      <Text
        style={[
          styles.number,
          {
            fontSize,
            color: style.text,
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
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  shine: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  number: {
    fontWeight: '800',
    textAlign: 'center',
  },
});
