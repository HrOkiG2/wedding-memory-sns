export default defineNuxtRouteMiddleware((to) => {
  const { authState, initAuth } = useAuth();

  // Always initialize auth from cookie on every navigation
  // This ensures cookie is read fresh after page reload
  initAuth();

  // Public routes that don't require auth
  // /slideshowは含めない: 招待客以外に写真が見えてしまうため、会場のPC/iPadでも
  // 事前にQRコード(招待客 or 管理者用トークン)でログインしてから開く運用とする
  const publicRoutes = ['/', '/login'];
  if (publicRoutes.includes(to.path)) {
    return;
  }

  // Redirect to login if not authenticated
  if (!authState.value.isAuthenticated) {
    return navigateTo('/');
  }
});
