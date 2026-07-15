import { StyleSheet, Text, type TextProps } from 'react-native';

import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'subtitle' | 'small' | 'smallBold' | 'bold';
  themeColor?: ThemeColor;
};

/** テーマカラーを適用した Text。色は themeColor で指定し直書きしない */
export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'bold' && styles.bold,
        type === 'title' && styles.title,
        type === 'subtitle' && styles.subtitle,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: { fontSize: 16, lineHeight: 24 },
  bold: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
  subtitle: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
});
