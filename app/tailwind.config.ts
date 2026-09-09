import type { Config } from 'tailwindcss';

// 色・シャドウ・フォントは assets/css/theme.css の CSS 変数を参照する。
// 実際の値は data-theme (NUXT_PUBLIC_UI_THEME) によって切り替わる。
// テーマ追加時は theme.css にブロックを足すだけでよく、ここは変更不要。
export default {
  content: [],
  theme: {
    extend: {
      colors: {
        'oki-blue': 'var(--c-primary)',
        'oki-yellow': 'var(--c-secondary)',
        'oki-pink': 'var(--c-accent)',
        'oki-sand': 'var(--c-bg)',
        'oki-text': 'var(--c-ink)',
        'oki-surface': 'var(--c-surface)',
        'oki-border': 'var(--c-border)',
        'oki-emphasis': 'var(--c-emphasis)',
        'oki-table-a': 'var(--c-table-a)',
        'oki-table-b': 'var(--c-table-b)',
        'oki-table-c': 'var(--c-table-c)',
        'oki-table-d': 'var(--c-table-d)',
        'oki-me': 'var(--c-me)',
      },
      fontFamily: {
        heading: 'var(--font-heading)',
        body: 'var(--font-body)',
      },
      borderWidth: {
        theme: 'var(--c-border-w)',
        'theme-lg': 'var(--c-border-w-lg)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        'card-lg': 'var(--radius-card-lg)',
      },
      boxShadow: {
        pop: 'var(--shadow-pop)',
        'pop-hover': 'var(--shadow-pop-hover)',
        'pop-card': 'var(--shadow-pop-card)',
      },
    },
  },
  plugins: [],
} satisfies Config;
