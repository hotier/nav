/** 首页/分类页的即时过滤词：顶栏搜索框输入时实时写入，回车仍跳转搜索页 */
export function useLiveSearch() {
  const query = useState<string>("live-search", () => "");
  return { query };
}

export function matchLink(
  link: { title: string; url: string; description?: string | null },
  keyword: string,
): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  return (
    link.title.toLowerCase().includes(q) ||
    link.url.toLowerCase().includes(q) ||
    (link.description ?? "").toLowerCase().includes(q)
  );
}
