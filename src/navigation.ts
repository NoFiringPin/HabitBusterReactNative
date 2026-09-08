import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

/** The app's screen graph. Functional-core scope. */
export type RootStackParamList = {
  Dashboard: undefined;
  DeviceHub: undefined;
  Scan: undefined;
  Calibrate: undefined;
  Monitor: undefined;
};

export type Nav<T extends keyof RootStackParamList> =
  NativeStackNavigationProp<RootStackParamList, T>;

export type Route<T extends keyof RootStackParamList> = RouteProp<
  RootStackParamList,
  T
>;
