export type Accent = "blue" | "violet" | "emerald" | "amber" | "rose";

export const ACCENTS: Array<{ value: Accent; label: string; swatch: string }> = [
  { value: "blue", label: "经典蓝", swatch: "hsl(221 83% 53%)" },
  { value: "violet", label: "紫罗兰", swatch: "hsl(262 83% 58%)" },
  { value: "emerald", label: "祖母绿", swatch: "hsl(160 84% 33%)" },
  { value: "amber", label: "琥珀", swatch: "hsl(32 95% 44%)" },
  { value: "rose", label: "玫瑰", swatch: "hsl(347 77% 50%)" },
];

const ACCENT_KEY = "accent";

export function useAccent() {
  const accent = useState<Accent>("accent", () => "blue");

  function apply(next: Accent) {
    if (!import.meta.client) return;
    if (next === "blue") document.documentElement.removeAttribute("data-accent");
    else document.documentElement.setAttribute("data-accent", next);
  }

  function setAccent(next: Accent) {
    accent.value = next;
    if (!import.meta.client) return;
    localStorage.setItem(ACCENT_KEY, next);
    apply(next);
  }

  function initAccent() {
    if (!import.meta.client) return;
    const saved = localStorage.getItem(ACCENT_KEY) as Accent | null;
    accent.value = ACCENTS.some((item) => item.value === saved) ? (saved as Accent) : "blue";
    apply(accent.value);
  }

  return { accent, setAccent, initAccent };
}
