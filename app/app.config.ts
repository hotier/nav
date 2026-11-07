export default defineAppConfig({
  ui: {
    colors: {
      primary: "blue",
      neutral: "slate",
    },
    /**
     * Switch 视觉增强。
     *
     * 默认主题的未选中轨道是 `bg-accented`（≈ --color-secondary，亮色下 hsl(240 5% 96%)），
     * 放在浅色卡片或 bg-muted/20 容器里几乎与背景同色，看不出这是个开关。
     * 这里只改颜色相关的 slot，尺寸档位沿用默认：
     *   - 未选中轨道：中灰（muted-foreground/40）+ 描边，保证在浅/深底上都可见
     *   - 滑块：纯白 + 阴影 + 细描边，与轨道拉开层次（深色模式同样成立）
     */
    switch: {
      slots: {
        base: [
          "inline-flex items-center shrink-0 rounded-full border-2 border-transparent focus-visible:outline-3",
          // 未选中：中灰轨道 + 描边，浅色底上不再与背景同色
          "data-[state=unchecked]:bg-muted-foreground/40 data-[state=unchecked]:border-border",
          "dark:data-[state=unchecked]:bg-muted-foreground/30 dark:data-[state=unchecked]:border-border",
          "transition-[background] duration-200 ease-out",
        ],
        thumb: [
          "group pointer-events-none rounded-full bg-white shadow-md ring-1 ring-black/10",
          "dark:bg-slate-100 dark:ring-white/20",
          "transition-transform duration-200 ease-out motion-reduce:transition-none",
          "data-[state=unchecked]:translate-x-0 data-[state=unchecked]:rtl:-translate-x-0",
          "flex items-center justify-center",
        ],
      },
    },
  },
});
