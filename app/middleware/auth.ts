export default defineNuxtRouteMiddleware((to) => {
  const { authState, initAuth } = useAuth();

  // Always initialize auth from cookie on every navigation
  // This ensures cookie is read fresh after page reload
  initAuth();

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
