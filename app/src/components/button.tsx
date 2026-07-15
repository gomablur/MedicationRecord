import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
};

/** 自前実装のボタン(3プラットフォーム共通) */
export function Button({ title, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  const theme = useTheme();
  const dimmed = disabled || loading;
  const backgroundColor =
    variant === 'primary'
      ? theme.tintFill
      : variant === 'danger'
        ? theme.danger
        : theme.backgroundElement;
  const textColor =
    variant === 'primary'
      ? theme.tintOnFill
      : variant === 'danger'
        ? theme.dangerOnFill
        : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={dimmed}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor },
        (pressed || dimmed) && { opacity: pressed ? 0.75 : 0.45 },
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <ThemedText type="bold" style={{ color: textColor }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    minHeight: 44,
  },
});
