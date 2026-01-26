// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Modules
  modules: ['@nuxt/eslint'],

  // SSG (Static Site Generation) for CloudFront hosting
  ssr: false,

  // Runtime config (environment variables)
  runtimeConfig: {
    public: {
      apiEndpoint: process.env.NUXT_PUBLIC_API_ENDPOINT || 'http://localhost:3001',
      eventId: process.env.NUXT_PUBLIC_EVENT_ID || 'WEDDING_DEV',
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
