/** 统一 toast 入口：Nuxt UI 的 useToast 只接对象，包一层保留 toast.success/error 调用习惯 */
export function useAppToast() {
  const toast = useToast();

  return {
    success(title: string) {
      return toast.add({ title, icon: "i-lucide-check" });
    },
    error(title: string) {
      return toast.add({ title, color: "error", icon: "i-lucide-circle-alert" });
    },
    info(title: string) {
      return toast.add({ title, icon: "i-lucide-info" });
    },
  };
}
