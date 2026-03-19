export type BallColorGroup = 'yellow' | 'blue' | 'red' | 'gray' | 'green';

export interface BallStyle {
  background: string;
  gradientEnd: string;
  text: string;
  shadow: string;
  glow: string;
}

const BALL_STYLES: Record<BallColorGroup, BallStyle> = {
  yellow: {
    background: '#FFBE2E',
    gradientEnd: '#FF9500',
    text: '#1A1200',
    shadow: '#FFBE2E',
    glow: 'rgba(255, 190, 46, 0.35)',
  },
  blue: {
    background: '#3B82F6',
    gradientEnd: '#1D4ED8',
    text: '#FFFFFF',
    shadow: '#3B82F6',
    glow: 'rgba(59, 130, 246, 0.35)',
  },
  red: {
    background: '#EF4444',
    gradientEnd: '#DC2626',
    text: '#FFFFFF',
    shadow: '#EF4444',
    glow: 'rgba(239, 68, 68, 0.35)',
  },
  gray: {
    background: '#8B8FA3',
    gradientEnd: '#64687A',
    text: '#FFFFFF',
    shadow: '#8B8FA3',
    glow: 'rgba(139, 143, 163, 0.30)',
  },
  green: {
    background: '#22C55E',
    gradientEnd: '#16A34A',
    text: '#FFFFFF',
    shadow: '#22C55E',
    glow: 'rgba(34, 197, 94, 0.35)',
  },
};

export function getBallColorGroup(num: number): BallColorGroup {
  if (num <= 10) return 'yellow';
  if (num <= 20) return 'blue';
  if (num <= 30) return 'red';
  if (num <= 40) return 'gray';
  return 'green';
}

export function getBallStyle(num: number): BallStyle {
  return BALL_STYLES[getBallColorGroup(num)];
}
