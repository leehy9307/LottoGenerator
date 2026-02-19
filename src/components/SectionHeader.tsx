import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/colors';

interface Props {
  title: string;
  subtitle: string;
  accentColor: string;
  emoji: string;
}

export default function SectionHeader({ title, subtitle, accentColor, emoji }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: accentColor }]}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  emoji: {
    fontSize: 24,
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
