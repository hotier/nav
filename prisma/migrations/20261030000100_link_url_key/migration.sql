-- Link 查重唯一约束（userId + urlKey）
--
-- 背景：应用层 `findFirst(url insensitive)` 在并发请求下会同时通过，产生重复链接；
-- 只有数据库唯一约束能兜底。这里新增归一化列并回填，不删除任何历史数据：
--   * 同一用户下 lower(url) 的首条记录 → urlKey = lower(btrim(url))
--   * 其余重复记录 → urlKey = lower(btrim(url)) || '#' || id（保留数据，仍可见可编辑）
-- 重复记录被编辑（URL 变化）时会写入正常 urlKey，若与现存记录冲突则按重复处理。

ALTER TABLE "Link" ADD COLUMN "urlKey" TEXT;

UPDATE "Link" SET "urlKey" = lower(btrim("url"));

WITH ranked AS (
    SELECT "id",
           row_number() OVER (
               PARTITION BY "userId", "urlKey"
               ORDER BY "createdAt", "id"
           ) AS rn
    FROM "Link"
)
UPDATE "Link" AS l
SET "urlKey" = l."urlKey" || '#' || l."id"
FROM ranked AS r
WHERE l."id" = r."id" AND r.rn > 1;

ALTER TABLE "Link" ALTER COLUMN "urlKey" SET NOT NULL;

CREATE UNIQUE INDEX "Link_userId_urlKey_key" ON "Link"("userId", "urlKey");
