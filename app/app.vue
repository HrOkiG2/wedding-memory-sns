<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
// Initialize auth on app load
const { initAuth } = useAuth();

onMounted(() => {
  initAuth();
});
</script>
