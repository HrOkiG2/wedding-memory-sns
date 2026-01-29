// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Modules
  modules: ['@nuxt/eslint', '@nuxtjs/tailwindcss'],

  // SSG (Static Site Generation) for CloudFront hosting
  ssr: false,

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
    }
  },

  // App configuration
  app: {
    head: {
      title: 'Wedding Photo Share',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Share your wedding photos' },
        { name: 'theme-color', content: '#ffffff' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
    },
  },

  // TypeScript
  typescript: {
    strict: true,
  },
})
