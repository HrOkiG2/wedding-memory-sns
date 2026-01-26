export default defineNuxtRouteMiddleware((to) => {
  const { authState, initAuth } = useAuth();

  // Initialize auth on first load
  if (!authState.value.isAuthenticated) {
    initAuth();
  }

  // Public routes that don't require auth
  const publicRoutes = ['/', '/login'];
  if (publicRoutes.includes(to.path)) {
    return;
  }

  // Redirect to login if not authenticated
  if (!authState.value.isAuthenticated) {
    return navigateTo('/');
  }
});
