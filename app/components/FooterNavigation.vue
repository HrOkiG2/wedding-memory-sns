<script setup lang="ts"></script>
<template>
    <nav
      class="fixed bottom-4 left-4 right-4 bg-oki-surface border-theme-lg border-oki-border rounded-full h-16 shadow-pop-card flex justify-around items-center px-2 z-50"
    >
      <NuxtLink to="/feed" class="flex-1 text-center text-2xl">🏠</NuxtLink>
      <NuxtLink to="/upload" class="flex-1 -mt-8">
        <div
          class="bg-oki-blue w-16 h-16 rounded-full border-theme-lg border-oki-border flex items-center justify-center text-3xl shadow-pop btn-press mx-auto"
        >
          📷
        </div>
      </NuxtLink>
      <NuxtLink to="/slideshow" class="flex-1 text-center text-2xl grayscale hover:grayscale-0 transition"
        >🖼️</NuxtLink
      >
    </nav>
</template>