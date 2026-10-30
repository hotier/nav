import type { PiniaColadaOptions } from "@pinia/colada";

export default {
  queryOptions: {
    // 60s 内重新进入页面直接用缓存；写操作通过失效立即重取
    staleTime: 60_000,
  },
} satisfies PiniaColadaOptions;
