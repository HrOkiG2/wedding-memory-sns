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
  } else if (authState.value.isAuthenticated) {
    // Already logged in, redirect to feed
    router.replace('/feed');
  }
});
</script>

<template>
  <div class="login-page">
    <div class="container">
      <h1>Wedding Photo Share</h1>

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
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.container {
  text-align: center;
  max-width: 400px;
  padding: 2rem;
  background: white;
  border-radius: 1rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

h1 {
  font-size: 1.5rem;
  color: #333;
  margin-bottom: 1.5rem;
}

.loading {
  color: #666;
}

.error {
  color: #dc3545;
}

.welcome {
  color: #333;
}

.hint {
  font-size: 0.875rem;
  color: #888;
  margin-top: 0.5rem;
}
</style>
