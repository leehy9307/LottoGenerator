import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import MainScreen from './src/screens/MainScreen';
import SplashScreen from './src/components/SplashScreen';

// 네이티브 스플래시가 자동으로 사라지지 않게 방지
ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // 네이티브 스플래시 즉시 숨기고 커스텀 스플래시 표시
    ExpoSplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
    <View style={styles.root}>
      <MainScreen />
      {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0B1A',
  },
});
