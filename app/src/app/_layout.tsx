import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';

import { SessionProvider, useSession } from '@/auth/session';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * ルートレイアウト。SessionProvider + テーマを提供し、
 * 認証状態に応じて Protected ルートがログイン画面と本体を切り替える。
 */

function RootNavigator() {
  const { user, loading } = useSession();
  const theme = useTheme();

  // セッション復元中は何も出さない(初回の一瞬なのでスピナーのみ)
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.tint} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerTintColor: theme.tint,
        headerTitleStyle: { color: theme.text },
      }}>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="record/[id]" options={{ title: '記録の詳細' }} />
        <Stack.Screen name="record/new" options={{ title: '記録の入力' }} />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const theme = Colors[dark ? 'dark' : 'light'];

  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme : DefaultTheme).colors,
      background: theme.background,
      card: theme.surface,
      text: theme.text,
      primary: theme.tint,
      border: theme.grid,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <SessionProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </SessionProvider>
    </ThemeProvider>
  );
}
