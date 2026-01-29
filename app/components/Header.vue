<script setup lang="ts">
const config = useRuntimeConfig();
</script>

<template>
    <header class="bg-oki-sand border-b-4 border-black p-4 mb-8 relative">
      <!-- Top decoration line -->
      <div
        class="absolute top-0 left-0 w-full h-2 bg-red-500 border-b-2 border-black flex items-center justify-center gap-1 overflow-hidden"
      >
        <div class="flex gap-1">
          <div class="w-2 h-2 bg-white"/>
          <div class="w-2 h-2 bg-white"/>
          <div class="w-2 h-2 bg-white"/>
          <div class="w-2 h-2 bg-white"/>
          <div class="w-2 h-2 bg-white"/>
        </div>
        <div class="w-4"/>
        <div class="flex gap-1">
          <div class="w-2 h-2 bg-white"/>
          <div class="w-2 h-2 bg-white"/>
          <div class="w-2 h-2 bg-white"/>
          <div class="w-2 h-2 bg-white"/>
        </div>
      </div>

      <div class="mt-4 flex justify-between items-end">
        <div>
          <h1
            class="text-4xl font-black text-red-500 tracking-tighter"
            style="-webkit-text-stroke: 1.5px black"
          >
{{ config.public.groomName }}<br />&amp; {{ config.public.brideName }}
          </h1>
        </div>
        <div class="text-right">
          <span
            class="block text-xs font-bold bg-black text-white px-2 py-1 rounded-md transform -rotate-2"
          >
{{ config.public.weddingDate }}
          </span>
          <span class="text-2xl mt-1 block">🌴 Wedding</span>
        </div>
      </div>
    </header>
</template>