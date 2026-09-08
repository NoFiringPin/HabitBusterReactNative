import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CalibrationWizard } from './src/screens/CalibrationWizard';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { DeviceHubScreen } from './src/screens/DeviceHubScreen';
import { MonitorScreen } from './src/screens/MonitorScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { appController } from './src/state/appController';
import { AppColors } from './src/theme';
import type { RootStackParamList } from './src/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: AppColors.bg },
};

const headerOptions = {
  headerStyle: { backgroundColor: AppColors.bg },
  headerTintColor: AppColors.ink,
  headerTitleStyle: { fontWeight: '700' as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: AppColors.bg },
};

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void appController.init().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.bg }}>
        <ActivityIndicator size="large" color={AppColors.green} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={headerOptions}>
          <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
          <Stack.Screen name="DeviceHub" component={DeviceHubScreen} options={{ title: 'Device & Behaviors' }} />
          <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Connect your wearable' }} />
          <Stack.Screen name="Calibrate" component={CalibrationWizard} options={{ title: 'Calibrate a behavior' }} />
          <Stack.Screen name="Monitor" component={MonitorScreen} options={{ title: 'Live monitor' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
