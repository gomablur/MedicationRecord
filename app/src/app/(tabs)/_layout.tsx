import { Ionicons } from '@expo/vector-icons';
import { Link, Tabs } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** メイン3タブ(記録一覧 / QR取り込み / 設定)。3プラットフォーム共通の JS タブ */
export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textMuted,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.background },
        headerTitleStyle: { color: theme.text },
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.grid },
        sceneStyle: { backgroundColor: theme.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '記録',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="medkit-outline" size={size} color={color} />
          ),
          headerRight: () => (
            <Link href="/record/new" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="記録を追加"
                style={styles.headerButton}>
                <Ionicons name="add" size={26} color={theme.tint} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'QR取り込み',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="qr-code-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerButton: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
});
