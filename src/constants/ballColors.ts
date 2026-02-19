export type BallColorGroup = 'yellow' | 'blue' | 'red' | 'gray' | 'green';

export interface BallStyle {
  background: string;
  text: string;
  shadow: string;
}

const BALL_STYLES: Record<BallColorGroup, BallStyle> = {
  yellow: { background: '#FFC107', text: '#1A1A1A', shadow: '#FFD54F' },
  blue:   { background: '#2196F3', text: '#FFFFFF', shadow: '#64B5F6' },
  red:    { background: '#F44336', text: '#FFFFFF', shadow: '#EF5350' },
  gray:   { background: '#9E9E9E', text: '#FFFFFF', shadow: '#BDBDBD' },
  green:  { background: '#4CAF50', text: '#FFFFFF', shadow: '#66BB6A' },
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
