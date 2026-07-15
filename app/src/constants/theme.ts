/**
 * デザイントークン(色・余白)。色は必ずここから取り、コンポーネントに直書きしない。
 *
 * 使い分け:
 * - background / surface / backgroundElement — ページ > カード > 内部要素の3層
 * - tint — 操作系のアクセント(文字・アイコン・リンク)
 * - tintFill / tintOnFill — 「塗り」(ボタン)とその上に乗る文字色。
 *   ライト/ダーク共通の深緑で白文字のコントラストを確保する
 * - danger / dangerOnFill — 破壊的操作(削除)の塗りと文字
 */

export const Colors = {
  light: {
    text: '#0b0b0b',
    textSecondary: '#4f524f',
    textMuted: '#84887f',
    background: '#f7f9f7',
    surface: '#fdfdfc',
    backgroundElement: '#eef1ec',
    border: 'rgba(11,11,11,0.12)',
    grid: '#e0e4dd',
    tint: '#1f7a5c',
    tintFill: '#1f7a5c',
    tintOnFill: '#ffffff',
    danger: '#c0392b',
    dangerOnFill: '#ffffff',
    badge: '#e3efe9',
  },
  dark: {
    text: '#ffffff',
    textSecondary: '#c3c7c1',
    textMuted: '#8b8f88',
    background: '#0d0f0d',
    surface: '#191c19',
    backgroundElement: '#242824',
    border: 'rgba(255,255,255,0.12)',
    grid: '#2c302c',
    tint: '#4fc297',
    tintFill: '#1f7a5c',
    tintOnFill: '#ffffff',
    danger: '#e05a4a',
    dangerOnFill: '#ffffff',
    badge: '#20302a',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
} as const;

export const MaxContentWidth = 720;
