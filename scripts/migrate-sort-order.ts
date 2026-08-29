/**
 * 一次性迁移：sortOrder 由「分类内编号」统一为「用户内全局编号」（方案 A，2026-08-29）。
 *
 * 背景：创建/导入链接时 sortOrder 按分类内 max+1 编号（每个分类都从 0 开始），
 * 而拖拽排序按当前视图全局重编号，两套编号混用导致：
 *   - 新建链接可能插到列表中间而不是末尾
 *   - 全局排序时同 sortOrder 大量重复，需靠 createdAt 兜底
 *
 * 本脚本按每个用户当前展示顺序（isPinned desc, sortOrder asc, createdAt asc）
 * 重新连续编号（0..N），使编号体系全局唯一、连续。
 *
 * 运行：npx ts-node --compiler-options {"module":"CommonJS"} scripts/migrate-sort-order.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  console.log(`共 ${users.length} 个用户`);

  let total = 0;
  for (const user of users) {
    const links = await prisma.link.findMany({
      where: { userId: user.id },
      // 与服务器展示排序完全一致，保证迁移后顺序不跳动
      orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    // 分块事务更新，避免单事务过大
    const CHUNK = 200;
    for (let i = 0; i < links.length; i += CHUNK) {
      const chunk = links.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map((link, j) =>
          prisma.link.update({
            where: { id: link.id },
            data: { sortOrder: i + j },
          })
        )
      );
    }

    total += links.length;
    console.log(`用户 ${user.name || user.id}: ${links.length} 条链接已重编号为 0..${links.length - 1}`);
  }

  console.log(`迁移完成，共 ${total} 条链接`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
