export default defineNuxtRouteMiddleware(() => {
  const { user } = useUserSession();
  const role = (user.value as { role?: string } | null)?.role;
  if (role !== "admin") return navigateTo("/dashboard");
});
