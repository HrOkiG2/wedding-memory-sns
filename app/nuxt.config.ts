// UIテーマ（デザイン案）: pop=ポップ / botanical=ナチュラル・ボタニカル
// ssr:false の静的ビルドなので、値はビルド時に固定される（他のNUXT_PUBLIC_*と同じ運用）
const UI_THEME = process.env.NUXT_PUBLIC_UI_THEME || 'pop';

// テーマごとに使うGoogle Fontsだけを読み込む（両方同時に読み込まない）
const THEME_FONT_LINKS: Record<string, string> = {
  pop: 'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@700;800;900&display=swap',
  botanical:
    'https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Zen+Maru+Gothic:wght@400;500;700&display=swap',
};

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Modules
  modules: ['@nuxt/eslint', '@nuxtjs/tailwindcss'],

  // SSG (Static Site Generation) for CloudFront hosting
  ssr: false,

  css: ['~/assets/css/theme.css'],

  // Runtime config (environment variables)
  runtimeConfig: {
    public: {
      // ローカル開発時はNuxtのserver/apiを使用（空文字で相対パス）
      // 本番ではCloudFront経由のAPIを使用
      apiEndpoint: process.env.NUXT_PUBLIC_API_ENDPOINT || '/api',
      eventId: process.env.NUXT_PUBLIC_EVENT_ID || 'WEDDING_DEV',
      // Wedding info
      groomName: process.env.NUXT_PUBLIC_GROOM_NAME || 'Groom',
      brideName: process.env.NUXT_PUBLIC_BRIDE_NAME || 'Bride',
      weddingDate: process.env.NUXT_PUBLIC_WEDDING_DATE || '2026.01.01',
      // UI theme: 'pop' | 'botanical'（デザイン案から選択、composables/useTheme.ts 参照）
      uiTheme: UI_THEME,
    }
  },

  // App configuration
  app: {
    head: {
      title: 'Wedding Photo Share',
      htmlAttrs: {
        'data-theme': UI_THEME,
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Share your wedding photos' },
        { name: 'theme-color', content: '#ffffff' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: THEME_FONT_LINKS[UI_THEME] || THEME_FONT_LINKS.pop },
      ],
    },
  },

  // TypeScript
  typescript: {
    strict: true,
  },
})
