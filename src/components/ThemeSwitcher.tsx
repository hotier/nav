"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";

const THEME_CYCLE = ["light", "dark", "system"] as const;
const EXPIRY_KEY = "theme-expiry";
const EXPIRY_MS = 5 * 24 * 60 * 60 * 1000; // 5天

function getThemeIcon(theme: string | undefined) {
  if (theme === "dark") return Moon;
  if (theme === "light") return Sun;
  return Monitor;
}

function getThemeLabel(theme: string | undefined) {
  if (theme === "dark") return "切换浅色";
  if (theme === "light") return "跟随系统";
  return "切换深色";
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // 检查是否已过期
    const expiry = localStorage.getItem(EXPIRY_KEY);
    if (expiry && Date.now() > Number(expiry)) {
      localStorage.removeItem(EXPIRY_KEY);
      setTheme("system");
    }
  }, [setTheme]);

  const toggleTheme = useCallback(() => {
    const idx = THEME_CYCLE.indexOf(theme as typeof THEME_CYCLE[number]);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + EXPIRY_MS));
  }, [theme, setTheme]);

  // 未挂载时渲染占位，避免 hydration mismatch
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className="text-muted-foreground bg-muted/60"
      >
        <Monitor className="h-[18px] w-[18px]" />
      </Button>
    );
  }

  const Icon = getThemeIcon(theme);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="text-muted-foreground hover:text-foreground bg-muted/60 dark:bg-muted/60 hover:bg-primary/10 dark:hover:bg-primary/20"
      title={getThemeLabel(theme)}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="sr-only">切换主题</span>
    </Button>
  );
}
