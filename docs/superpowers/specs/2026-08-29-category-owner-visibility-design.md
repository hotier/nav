# 规格：分类创建者全权视角（他人链接对分类主人恒可见）

日期：2026-08-29

## 背景与问题

多用户导航站中，**公开分类**允许任何登录用户添加链接（协作共建）。由此产生一个让普通用户困惑的行为：

- 用户 A 创建公开分类「普通私有」，其中已有 **22 条链接**：1 条自己创建 + 21 条其他用户创建的公开链接。
- A 把分类设为**私有**后，`buildLinkWhere` 中"他人公开链接可见"的前提 `category.isPublic: true` 失效。
- 这 21 条他人创建的公开链接从 A 的可见范围消失，分类书签数从 **22 → 1**。
- A 是分类的主人，却在私有化后连自己分类里的内容都看不全，误以为"书签丢了"。

根因：**分类创建者不是自己分类的完整主人**——他人挂进来的公开链接在分类变私有后对其不可见。

## 决策

采用"**分类创建者全权视角**"（方案 4）：

> 分类创建者在自己创建的分类下，**永远能看到所有公开链接**（自己的 + 他人挂进来的）。私有化只是对公众和其他用户关门，对创建者本人零影响；数据零改动，谁的链接归谁。

### 备选方案（已否决）

| 方案 | 做法 | 否决原因 |
|---|---|---|
| 1. 知情+透明 | 变私有前弹窗提示 + 数量列拆分显示 | 只告知跳变，不消除跳变 |
| 2. 级联转私有 | 变私有时自动把他人链接 `isPrivate=true` | 越权修改他人数据，困惑转移给链接创建者 |
| 3. 强制迁移 | 变私有时要求先处理他人链接 | 流程强制、无"未分类"桶可移 |

## 权限规则变更

`buildLinkWhere`（`src/lib/permissions.ts`）中，**登录普通用户 home 分支**从 2 个 OR 项扩展为 3 个：

```ts
// 登录普通用户 home：自己的全部 + 别人的公开（均排除隐藏）
return {
  OR: [
    { userId, isHidden: false },                                       // 自己的全部（现状）
    { isPrivate: false, isHidden: false,
      category: { isPublic: true, isHidden: false } },                 // 他人的公开链接·分类公开时（现状）
    { isPrivate: false, isHidden: false,
      category: { userId, isHidden: false } },                         // 新增：我创建的分类下的他人公开链接
  ],
};
```

新增分支语义：**「我创建的、未隐藏的分类」下的「他人创建的、公开且未隐藏的链接」**。

效果对照（用户 A，分类「普通私有」含 1 条自己的 + 21 条他人公开链接）：

| 视角 | 分类公开时 | 分类私有后 |
|---|---|---|
| 创建者 A | 22 条 | **22 条（不变）** |
| 公众 / 其他用户 | 22 条 | 0 条（关门） |
| 链接创建者 | 可见自己的 | 仍可见自己的 |

## 应用范围

改动**全局生效**于所有 home 口径调用点（不限定"分类维度"，因为前端分类视图依赖全量数据）：

- `lib/queries.ts`：`getLinkCount`、`getAllLinks`（SSR）
- `lib/search.ts`：`buildSearchWhere`（搜索 GET/POST 同源）
- `app/api/links/route.ts`：GET 链接列表（首页/分类页/管理页数据源）
- `app/api/categories/route.ts`：GET 分类列表（links include）
- `app/api/categories/[id]/route.ts`：GET 分类详情

理由：`HomeContentClient` / `CategoryContentClient` / 分类管理页都从 `/api/links` 拉取**全量 home 口径数据**，前端按 `categoryId` 过滤。只有全局生效，"数量不跳变"才能在首页、分类页、分类管理页同时成立。

## 缓存键 bump（必须）

权限语义变更**不触发数据库版本号**，浏览器 localStorage 中的旧缓存会继续按旧可见性显示数据。因此必须 bump 缓存键使旧缓存天然 miss：

| 键 | 变更 |
|---|---|
| `links:v2` → `links:v3` | `cache-keys.ts` 的 `linkListKey` |
| `links:count:v2` → `links:count:v3` | `cache-keys.ts` 的 `linkCountKey` |
| `categories:v3` → `categories:v4` | `cache-keys.ts` 的 `categoryKey`（其 links include 数据同样变化） |
| `dashboard:stats:v2` | **不 bump**：stats 用 manage 口径，普通用户只统计自己的链接，不受本轮影响 |

同时，前端 `useDataCache` / `useInfiniteScroll` 的 localStorage 缓存名必须同步 bump，否则旧可见性数据会因「本地版本 == 服务端版本」被信任命中：

- `name: "Link"` → `"Link:v2"`（首页 / 分类页 / 链接管理页 / 分类管理页，`versionTable` 保持 `"Link"`）
- `name: "Category:v3"` → `"Category:v4"`，并补齐 `versionTable: "Category"`（首页 / 分类页 / 搜索页 / 导入导出页；当前无 `versionTable` 导致版本比对永远 miss、分类树缓存形同虚设，本轮一并修正，使分类可见性变更有真实版本锚点）
- `name: "Category:mgmt:v3"` **不 bump**（manage 口径：分类管理页只显示自己的链接，不受本轮影响）

## 隐私边界（严格不越权）

| 情况 | 结果 |
|---|---|
| 他人**私有**链接（`isPrivate=true`） | 不可见（新增分支要求 `isPrivate: false`）✅ |
| 被管理员隐藏的链接（`isHidden=true`） | 不可见（新增分支要求 `isHidden: false`）✅ |
| 我创建但被管理员隐藏的分类 | 其下他人链接不可见（新增分支要求 `category.isHidden: false`）✅ |
| 别人创建的分类 | 不匹配此分支（要求 `category.userId = 当前用户`）✅ |
| 未登录用户 | 逻辑不变（`!userId` 提前返回）✅ |
| 管理员 | 逻辑不变（管理员分支先行返回）✅ |

## 影响面

均符合"分类主人"语义，可接受：

- 首页"全部书签 (N)"：创建者的 N 变大（含自己分类下的他人公开链接）。
- 链接管理页（dashboard/links）：出现自己分类下的他人链接，**只读**（前端已有 `manageable` 判断，现有逻辑已支持他人链接只读展示）。
- 搜索：一致，可搜到这些链接。
- 仪表盘统计：**不受影响**——`/api/dashboard/stats` 使用 manage 口径，普通用户只统计自己的链接（`{ userId, isHidden: false }`），`totalLinks` 不变。

## 明确不做

- 不改任何他人数据（不级联转私有、不迁移、不删除）。
- 不做存量清理（「普通私有」分类里现存的 21 条他人链接原样保留）。
- 不加变私有前的确认弹窗（数量对创建者恒定，不再需要）。

## 验证方式

1. 用 `common` 账号登录，确认「普通私有」分类在分类管理页显示 22 条；将其设为私有后仍显示 22 条（改动前会变 1 条）。
2. 用另一普通用户账号验证：看不到 `common` 的私有分类及其内容。
3. 用 `common` 验证他人**私有**链接不可见（如有人往其公开分类添加过私有链接，分类私有化后同样不可见）。
4. 未登录用户看不到私有分类内容（回归）。
5. 管理员视角不变：管理员仍看不到普通用户主动设私有的分类（上轮修复不回归）。
