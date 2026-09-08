/**
 * Shared palette mirroring the Flutter app's `AppColors` (lib/screens/ui_kit.dart)
 * and the dashboard's inline colors, so the RN port keeps the FaceDefense look.
 */
export const AppColors = {
  bg: '#f4fff9',
  green: '#10c984',
  greenDark: '#00775b',
  greenBorder: '#a6f2cf',
  blue: '#49aaf5',
  blueBorder: '#91ceff',
  red: '#ef4b75',
  amber: '#ffd93b',
  ink: '#252c3c',
  sub: '#788092',
  // Extra tints used by the dashboard cards.
  greenTintBg: '#eafff4',
  blueTintBg: '#f2f9ff',
  cardWhite: '#ffffff',
  pillGreen: '#c9f8d9',
  pillBlue: '#ace0ff',
} as const;
