<script setup lang="ts">
const config = useRuntimeConfig();
const { theme } = useTheme();

// テーマごとの飾り絵文字（南国ポップ🌴 / 草花のボタニカル🌿）
const wordmarkEmoji = computed(() => (theme.value === 'botanical' ? '🌿' : '🌴'));
</script>

<template>
    <header class="bg-oki-sand border-b-theme-lg border-oki-border p-4 mb-8 relative">
      <!-- Top decoration line -->
      <div
        class="absolute top-0 left-0 w-full h-2 bg-oki-emphasis border-b-2 border-oki-border flex items-center justify-center gap-1 overflow-hidden"
      >
        <div class="flex gap-1">
          <div class="w-2 h-2 bg-oki-surface"/>
          <div class="w-2 h-2 bg-oki-surface"/>
          <div class="w-2 h-2 bg-oki-surface"/>
          <div class="w-2 h-2 bg-oki-surface"/>
          <div class="w-2 h-2 bg-oki-surface"/>
        </div>
        <div class="w-4"/>
        <div class="flex gap-1">
          <div class="w-2 h-2 bg-oki-surface"/>
          <div class="w-2 h-2 bg-oki-surface"/>
          <div class="w-2 h-2 bg-oki-surface"/>
          <div class="w-2 h-2 bg-oki-surface"/>
        </div>
      </div>

      <div class="mt-4 flex justify-between items-end">
        <div>
          <h1
            class="font-heading text-4xl font-black text-oki-emphasis tracking-tighter"
            style="-webkit-text-stroke: var(--text-stroke, 0px transparent)"
          >
{{ config.public.groomName }}<br />&amp; {{ config.public.brideName }}
          </h1>
        </div>
        <div class="text-right">
          <span
            class="block text-xs font-bold bg-oki-text text-oki-surface px-2 py-1 rounded-md transform -rotate-2"
          >
{{ config.public.weddingDate }}
          </span>
          <span class="text-2xl mt-1 block">{{ wordmarkEmoji }} Wedding</span>
        </div>
      </div>
    </header>
</template>