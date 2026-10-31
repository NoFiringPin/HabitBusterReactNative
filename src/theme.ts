/**
 * Shared palette mirroring the Flutter app's `AppColors` (lib/screens/ui_kit.dart)
 * and the dashboard's inline colors, so the RN port keeps the FaceDefense look.
 */
export const AppColors = {
  bg: '#f3f7f5',
  green: '#087f63',
  greenDark: '#075b4a',
  greenBorder: '#dcebe3',
  blue: '#347eae',
  blueBorder: '#d8e7f0',
  red: '#ef4b75',
  amber: '#ffd93b',
  ink: '#183c34',
  sub: '#63766f',
  // Extra tints used by the dashboard cards.
  greenTintBg: '#e9f4ee',
  blueTintBg: '#eef4f8',
  cardWhite: '#ffffff',
  pillGreen: '#dcefe3',
  pillBlue: '#dceaf4',
} as const;
