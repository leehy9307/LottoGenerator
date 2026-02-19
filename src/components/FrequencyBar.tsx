import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { COLORS } from '../constants/colors';
import { NumberFrequency } from '../types/lotto';
import { getBallStyle } from '../constants/ballColors';

interface Props {
  data: NumberFrequency[];
  maxCount: number;
  accentColor: string;
  triggerKey: number;
}

function BarItem({
  item,
  maxCount,
  index,
  accentColor,
  triggerKey,
}: {
  item: NumberFrequency;
  maxCount: number;
  index: number;
  accentColor: string;
  triggerKey: number;
}) {
  const widthPercent = useSharedValue(0);
  const barColor = getBallStyle(item.number).background;
  const targetWidth = Math.max((item.count / maxCount) * 100, 5);

  useEffect(() => {
    widthPercent.value = 0;
    widthPercent.value = withDelay(
      index * 80,
      withTiming(targetWidth, { duration: 600, easing: Easing.out(Easing.cubic) })
    );
  }, [triggerKey]);

  const animatedBarStyle = useAnimatedStyle(() => ({
    width: `${widthPercent.value}%` as any,
  }));

  return (
    <View style={styles.barRow}>
      <View style={[styles.numberBadge, { backgroundColor: barColor + '30' }]}>
        <Text style={[styles.numberText, { color: barColor }]}>{item.number}</Text>
      </View>
      <View style={styles.barContainer}>
        <Animated.View
          style={[
            styles.bar,
            { backgroundColor: barColor },
            animatedBarStyle,
          ]}
        />
      </View>
      <Text style={styles.countText}>{item.count}회</Text>
    </View>
  );
}

export default function FrequencyBar({ data, maxCount, accentColor, triggerKey }: Props) {
  return (
    <View style={styles.container}>
      {data.map((item, idx) => (
        <BarItem
          key={item.number}
          item={item}
          maxCount={maxCount}
          index={idx}
          accentColor={accentColor}
          triggerKey={triggerKey}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 8,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  numberBadge: {
    width: 32,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberText: {
    fontSize: 12,
    fontWeight: '700',
  },
  barContainer: {
    flex: 1,
    height: 20,
    backgroundColor: COLORS.barBackground,
    borderRadius: 10,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 10,
    opacity: 0.8,
  },
  countText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    width: 32,
    textAlign: 'right',
  },
});
