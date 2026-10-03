export type UiTheme = 'pop' | 'botanical';

/**
 * NUXT_PUBLIC_UI_THEME で選んだUIテーマ。
 * 実際の見た目は assets/css/theme.css の [data-theme] トークンで切り替わる。
 * ここは「テーマ名で分岐したい」コンポーネント（絵文字の出し分けなど）向け。
 */
export const useTheme = () => {
  const config = useRuntimeConfig();
  const theme = computed<UiTheme>(() => (config.public.uiTheme as UiTheme) || 'pop');

  return { theme };
};
