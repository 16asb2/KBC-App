import { Platform } from 'react-native';

export const KBC = {
  pink: '#c0005a',
  black: '#0a0a0a',
  darkGrey: '#1c1c1c',
  green: '#4db847',
  cyan: '#00b4d8',
  purple: '#9b5de5',
  white: '#ffffff',
  orange: '#f97316',
  lime:   '#84cc16',
};

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: KBC.pink,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: KBC.pink,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: KBC.white,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: KBC.white,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
