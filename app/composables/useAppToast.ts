import type { Toast } from "@nuxt/ui/composables/useToast";

/**
 * 统一 toast 入口。
 *
 * 两种用法并存：
 *   - 语义快捷方法：`toast.success("已保存")` / `toast.error("失败")` / `toast.info(...)`
 *   - 原生对象形式：`toast.add({ title, color, icon, ... })`（与 Nuxt UI 的 useToast 一致）
 *
 * 全站只走这一层，保证位置（右上）、时长、图标语义一致；
 * 需要自定义字段时仍可传完整对象，不用为了一个 icon 退回 useToast。
 */
export function useAppToast() {
  const toast = useToast();

  return {
    add(options: Partial<Toast>) {
      return toast.add(options);
    },
    success(title: string) {
      return toast.add({ title, icon: "i-lucide-check" });
    },
    error(title: string) {
      return toast.add({ title, color: "error", icon: "i-lucide-circle-alert" });
    },
    info(title: string) {
      return toast.add({ title, icon: "i-lucide-info" });
    },
    warning(title: string) {
      return toast.add({ title, color: "warning", icon: "i-lucide-triangle-alert" });
    },
  };
}
