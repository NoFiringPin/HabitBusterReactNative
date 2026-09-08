import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { AppColors } from '../theme';

/** A rounded, bordered card — the RN analogue of the Flutter `appCard`. */
export function AppCard(props: {
  children: React.ReactNode;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const {
    children,
    color = AppColors.cardWhite,
    borderColor = AppColors.greenBorder,
    borderWidth = 1.5,
    style,
  } = props;
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: color, borderColor, borderWidth },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A small colored pill/badge. */
export function StatusPill(props: {
  label: string;
  bg: string;
  fg: string;
  dot?: boolean;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: props.bg }]}>
      {props.dot && (
        <View style={[styles.dot, { backgroundColor: props.fg }]} />
      )}
      <Text style={[styles.pillText, { color: props.fg }]}>{props.label}</Text>
    </View>
  );
}

/** A filled primary button. */
export function PrimaryButton(props: {
  label: string;
  onPress?: () => void;
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  const bg = props.disabled ? '#b0b7c3' : props.color ?? AppColors.green;
  return (
    <Pressable
      onPress={props.disabled ? undefined : props.onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          {props.icon}
          <Text style={styles.primaryBtnText}>{props.label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** An outlined secondary button. */
export function OutlineButton(props: {
  label: string;
  onPress?: () => void;
  color?: string;
  disabled?: boolean;
}) {
  const fg = props.color ?? AppColors.blue;
  return (
    <Pressable
      onPress={props.disabled ? undefined : props.onPress}
      style={({ pressed }) => [
        styles.outlineBtn,
        { borderColor: fg, opacity: pressed || props.disabled ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.outlineBtnText, { color: fg }]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: 14,
    borderRadius: 18,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 18,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 11, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  outlineBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  outlineBtnText: { fontSize: 14, fontWeight: '700' },
});
