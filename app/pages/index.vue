<script setup lang="ts">
const route = useRoute();
const router = useRouter();
const { authState, login, initAuth } = useAuth();

const isLoading = ref(false);
const errorMessage = ref('');

onMounted(async () => {
  initAuth();

  // Check for token in URL (QR code scan)
  const token = route.query.token as string | undefined;
  if (token) {
    if (authState.value.isAuthenticated && authState.value.payload?.sub === token) {
      router.replace('/feed');
    } else {
      isLoading.value = true;
      errorMessage.value = '';

      const result = await login(token);
      isLoading.value = false;

      if (result.success) {
        // Remove token from URL and redirect to feed
        router.replace('/feed');
      } else {
        errorMessage.value = result.error || 'ログインに失敗しました';
        // Remove token from URL
        router.replace('/');
      }
    }
  } else if (authState.value.isAuthenticated) {
    // Already logged in, redirect to feed
    router.replace('/feed');
  }
});
</script>

<template>
  <div class="login-page">
    <div class="container">
      <h1 class="app-title">Wedding Photo Share</h1>

      <div v-if="isLoading" class="loading">
        <p>ログイン中...</p>
      </div>

      <div v-else-if="errorMessage" class="error">
        <p>{{ errorMessage }}</p>
        <p class="hint">QRコードを再度スキャンしてください</p>
      </div>

      <div v-else class="welcome">
        <p>卓上のQRコードをスキャンしてください</p>
        <p class="hint">カメラアプリでQRコードを読み取ると、自動的にログインします</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: var(--c-bg);
}

.container {
  text-align: center;
  max-width: 400px;
  padding: 2rem;
  background: var(--c-surface);
  border: var(--c-border-w) solid var(--c-border);
  border-radius: var(--radius-card-lg);
  box-shadow: var(--shadow-pop-card);
}

.app-title {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  color: var(--c-ink);
  margin-bottom: 1.5rem;
}

.loading {
  color: var(--c-ink);
  opacity: 0.7;
}

.error {
  color: #dc3545;
}

.welcome {
  color: var(--c-ink);
}

.hint {
  font-size: 0.875rem;
  color: var(--c-ink);
  opacity: 0.6;
  margin-top: 0.5rem;
}
</style>
