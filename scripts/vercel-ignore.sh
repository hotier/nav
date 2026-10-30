#!/usr/bin/env bash
# Vercel「Ignored Build Step」：exit 0 = 跳过构建，exit 1 = 继续构建（与直觉相反）
# 只允许生产分支 main 构建部署，其它分支（含 vue 重写分支）一律跳过，两条线互不干扰。
set -u

BRANCH="${VERCEL_GIT_COMMIT_REF:-${VC_GIT_BRANCH:-}}"

# 非 Git 触发的部署（CLI 手动 deploy）拿不到分支信息，放行
if [ -z "$BRANCH" ]; then
  exit 1
fi

if [ "$BRANCH" = "main" ]; then
  exit 1
fi

echo "跳过构建：分支 ${BRANCH} 不是生产分支 main"
exit 0
