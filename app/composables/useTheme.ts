export type Theme = "light" | "dark" | "system";

const THEME_KEY = "theme";
const EXPIRY_KEY = "theme-expiry";
const EXPIRY_MS = 5 * 24 * 60 * 60 * 1000;

/** 主题状态（SSR 阶段固定为 system，客户端挂载后读取 localStorage 并应用） */
export function useTheme() {
  const theme = useState<Theme>("theme", () => "system");

  function apply(next: Theme) {
    if (!import.meta.client) return;
    const dark =
      next === "dark" ||
      (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }

  function setTheme(next: Theme) {
    theme.value = next;
    if (!import.meta.client) return;
    localStorage.setItem(THEME_KEY, next);
    apply(next);
  }

  /** 客户端初始化：读取本地偏好 + 过期检查 + 监听系统主题变化 */
  function initTheme() {
    if (!import.meta.client) return;
    const expiry = localStorage.getItem(EXPIRY_KEY);
    if (expiry && Date.now() > Number(expiry)) {
      localStorage.removeItem(EXPIRY_KEY);
      setTheme("system");
    } else {
      const saved = localStorage.getItem(THEME_KEY) as Theme | null;
      theme.value = saved === "light" || saved === "dark" ? saved : "system";
      apply(theme.value);
    }

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        if (theme.value === "system") apply("system");
      });
  }

  /** 循环切换：light → dark → system → light */
  function cycle() {
    const order: Theme[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(theme.value) + 1) % order.length]!;
    setTheme(next);
    if (import.meta.client) localStorage.setItem(EXPIRY_KEY, String(Date.now() + EXPIRY_MS));
  }

  return { theme, setTheme, initTheme, cycle };
}
