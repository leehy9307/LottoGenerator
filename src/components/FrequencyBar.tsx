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
  triggerKey,
}: {
  item: NumberFrequency;
  maxCount: number;
  index: number;
  triggerKey: number;
}) {
  const widthPercent = useSharedValue(0);
  const opacity = useSharedValue(0);
  const barColor = getBallStyle(item.number).background;
  const targetWidth = Math.max((item.count / maxCount) * 100, 6);

  useEffect(() => {
    widthPercent.value = 0;
    opacity.value = 0;
    opacity.value = withDelay(
      index * 60,
      withTiming(1, { duration: 300 }),
    );
    widthPercent.value = withDelay(
      index * 60,
      withTiming(targetWidth, { duration: 700, easing: Easing.out(Easing.cubic) })
    );
  }, [triggerKey]);

  const animatedBarStyle = useAnimatedStyle(() => ({
    width: `${widthPercent.value}%` as any,
  }));

  const animatedRowStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.barRow, animatedRowStyle]}>
      <View style={[styles.numberBadge, { backgroundColor: barColor + '18' }]}>
        <Text style={[styles.numberText, { color: barColor }]}>{item.number}</Text>
      </View>
      <View style={styles.barContainer}>
        <Animated.View
          style={[
            styles.bar,
            { backgroundColor: barColor },
            animatedBarStyle,
          ]}
        >
          <View style={styles.barShine} />
        </Animated.View>
      </View>
      <Text style={styles.countText}>{item.count}</Text>
    </Animated.View>
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
          triggerKey={triggerKey}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 7,
    marginTop: 6,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  numberBadge: {
    width: 34,
    height: 26,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberText: {
    fontSize: 12,
    fontWeight: '700',
  },
  barContainer: {
    flex: 1,
    height: 22,
    backgroundColor: COLORS.barBackground,
    borderRadius: 11,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 11,
    opacity: 0.75,
    overflow: 'hidden',
  },
  barShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
  },
  countText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    width: 28,
    textAlign: 'right',
  },
});
