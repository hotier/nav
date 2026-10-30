/**
 * 跨标签页数据变更广播 + 当前页缓存失效
 *
 * 写操作成功后广播表名，本页立即按实体根失效 Colada 查询（活跃查询自动重取，
 * 非活跃标记 stale 供下次进入使用）；其他标签页收到消息后做同样失效。
 */
type TableName = "Link" | "Category" | "User";

const CHANNEL = "onenav-data";

export function useDataSync() {
  const channel = ref<BroadcastChannel | null>(null);
  const queryCache = useQueryCache();

  function refreshFor(table: TableName) {
    for (const root of entityRoots[table]) {
      void queryCache.invalidateQueries({ key: [...root] });
    }
  }

  function notify(table: TableName) {
    if (import.meta.client) channel.value?.postMessage(table);
    refreshFor(table);
  }

  onMounted(() => {
    if (!("BroadcastChannel" in window)) return;
    channel.value = new BroadcastChannel(CHANNEL);
    channel.value.onmessage = (e) => {
      if (e.data === "Link" || e.data === "Category" || e.data === "User") refreshFor(e.data);
    };
  });

  onBeforeUnmount(() => {
    channel.value?.close();
    channel.value = null;
  });

  return { notify };
}
