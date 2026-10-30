/**
 * Pinia Colada 查询键与失效映射。
 * 键的第一个元素是「根」，按根失效可覆盖该域内所有查询。
 */
export const qk = {
  session: () => ["auth", "session"] as const,
  nav: () => ["nav"] as const,
  homeLinks: () => ["links", "home"] as const,
  search: (q: string) => ["search", q] as const,
  stats: () => ["dashboard", "stats"] as const,
  manageLinks: () => ["links", "manage"] as const,
  manageCategories: () => ["categories", "manage"] as const,
  users: () => ["users"] as const,
  account: () => ["account"] as const,
};

const ROOTS = {
  auth: ["auth"],
  nav: ["nav"],
  links: ["links"],
  search: ["search"],
  dashboard: ["dashboard"],
  categories: ["categories"],
  users: ["users"],
  account: ["account"],
} as const;

/** 写操作后按实体失效的查询根集合（与 useDataSync 广播共用） */
export const entityRoots: Record<"Link" | "Category" | "User", readonly (readonly string[])[]> = {
  Link: [ROOTS.links, ROOTS.search, ROOTS.dashboard, ROOTS.categories, ROOTS.nav],
  Category: [ROOTS.nav, ROOTS.links, ROOTS.categories, ROOTS.dashboard],
  User: [ROOTS.nav, ROOTS.links, ROOTS.categories, ROOTS.dashboard, ROOTS.auth, ROOTS.users],
};

export const sessionRoot = ROOTS.auth;

/**
 * 查询失败时退回空值而不是让 SSR 抛 500（错误对象也无法序列化进 payload）。
 * 页面已有空态兜底，与旧 useAsyncData 行为一致。
 */
export function withFallback<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch((error) => {
    console.warn("[query] 请求失败，使用空数据兜底:", error);
    return fallback;
  });
}
