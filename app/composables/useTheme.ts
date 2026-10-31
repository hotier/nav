export type Theme = "light" | "dark" | "system";

const EXPIRY_KEY = "theme-expiry";
const EXPIRY_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * 主题状态：以 @nuxtjs/color-mode 为唯一真源（html 上的 dark class、系统跟随都由它维护），
 * 这里只做薄封装，并保留产品要求的「主题偏好 5 天后回落到 system」。
 * 首帧的 class 纠正由 nuxt.config.ts 内联脚本（key: theme-init）负责，此处不再手动操作 DOM。
 */
export function useTheme() {
  const colorMode = useColorMode();

  // 是否已完成客户端挂载：SSR 与首帧统一回落 "system"，避免 hydration mismatch
  const mounted = useState<boolean>("theme-mounted", () => false);

  onMounted(() => {
    mounted.value = true;
  });

  /** 当前主题偏好；服务端 / 未挂载时固定返回 system */
  const theme = computed<Theme>(() => {
    if (!mounted.value) return "system";
    const preference = colorMode.preference;
    return preference === "light" || preference === "dark" ? preference : "system";
  });

  /** 写入偏好（color-mode 负责持久化到 localStorage.theme），并续期 5 天 */
  function setTheme(next: Theme) {
    colorMode.preference = next;
    if (!import.meta.client) return;
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + EXPIRY_MS));
  }

  /** 客户端初始化：只做过期判定，过期则回落到 system */
  function initTheme() {
    if (!import.meta.client) return;
    const expiry = Number(localStorage.getItem(EXPIRY_KEY));
    // 没有过期时间或尚未过期（含非法值）都不处理
    if (!expiry || Date.now() <= expiry) return;
    setTheme("system");
  }

  /** 循环切换：light → dark → system → light */
  function cycle() {
    const order: Theme[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(theme.value) + 1) % order.length]!;
    setTheme(next);
  }

  return { theme, setTheme, initTheme, cycle };
}
