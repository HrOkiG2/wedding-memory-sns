import type { Config } from 'tailwindcss';

export default {
  content: [],
  theme: {
    extend: {
      colors: {
        'oki-blue': '#00E5FF',   /* 海のような蛍光シアン */
        'oki-yellow': '#FFD600', /* 太陽のイエロー */
        'oki-pink': '#FF4081',   /* ハイビスカスピンク */
        'oki-sand': '#FFF9E5',   /* 明るい砂浜 */
        'oki-text': '#1a1a1a',   /* 墨文字 */
      },
      boxShadow: {
        'pop': '4px 4px 0px 0px rgba(0,0,0,1)',
        'pop-hover': '2px 2px 0px 0px rgba(0,0,0,1)',
        'pop-card': '6px 6px 0px 0px rgba(0,0,0,1)',
      },
    },
  },
  plugins: [],
} satisfies Config;