import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * 与线上 Prisma schema 逐列对齐：
 * - 表名/列名保留大小写（Prisma 未使用 @map）
 * - 时间列统一 TIMESTAMP(3) 无时区
 * - 索引/外键名沿用 Prisma 生成名，避免迁移反复 rename
 * - updatedAt 无 DB 默认值，由应用写入（与 Prisma client 行为一致）
 */

const newId = () => crypto.randomUUID();

export const users = pgTable(
  "User",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    name: text("name"),
    email: text("email"),
    emailVerified: timestamp("emailVerified", { precision: 3, mode: "date" }),
    image: text("image"),
    username: text("username"),
    password: text("password"),
    role: text("role").notNull().default("user"),
    isSystemAdmin: boolean("isSystemAdmin").notNull().default(false),
    tokenVersion: integer("tokenVersion").notNull().default(0),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("User_email_key").on(t.email),
    uniqueIndex("User_username_key").on(t.username),
  ],
);

export const accounts = pgTable(
  "Account",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("userId").notNull(),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    uniqueIndex("Account_provider_providerAccountId_key").on(t.provider, t.providerAccountId),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "Account_userId_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
  ],
);

export const sessions = pgTable(
  "Session",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    sessionToken: text("sessionToken").notNull(),
    userId: text("userId").notNull(),
    expires: timestamp("expires", { precision: 3, mode: "date" }).notNull(),
  },
  (t) => [
    uniqueIndex("Session_sessionToken_key").on(t.sessionToken),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "Session_userId_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
  ],
);

// 无主键（与线上一致），仅唯一索引
export const verificationTokens = pgTable(
  "VerificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { precision: 3, mode: "date" }).notNull(),
  },
  (t) => [
    uniqueIndex("VerificationToken_token_key").on(t.token),
    uniqueIndex("VerificationToken_identifier_token_key").on(t.identifier, t.token),
  ],
);

export const appSettings = pgTable("AppSetting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const categories = pgTable(
  "Category",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    slug: text("slug"),
    name: text("name").notNull(),
    icon: text("icon"),
    parentId: text("parentId"),
    isPublic: boolean("isPublic").notNull().default(false),
    isHidden: boolean("isHidden").notNull().default(false),
    userId: text("userId"),
    sortOrder: integer("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("Category_slug_key").on(t.slug),
    index("Category_parentId_idx").on(t.parentId),
    index("Category_userId_idx").on(t.userId),
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: "Category_parentId_fkey",
    })
      .onDelete("set null")
      .onUpdate("cascade"),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "Category_userId_fkey",
    })
      .onDelete("set null")
      .onUpdate("cascade"),
  ],
);

export const links = pgTable(
  "Link",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    title: text("title").notNull(),
    url: text("url").notNull(),
    urlKey: text("urlKey").notNull(),
    altUrl: text("altUrl"),
    description: text("description"),
    favicon: text("favicon"),
    categoryId: text("categoryId").notNull(),
    userId: text("userId").notNull(),
    isPrivate: boolean("isPrivate").notNull().default(false),
    isHidden: boolean("isHidden").notNull().default(false),
    isPinned: boolean("isPinned").notNull().default(false),
    sortOrder: integer("sortOrder").notNull().default(0),
    status: text("status").default("active"),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("Link_userId_urlKey_key").on(t.userId, t.urlKey),
    index("Link_userId_idx").on(t.userId),
    index("Link_categoryId_idx").on(t.categoryId),
    foreignKey({
      columns: [t.categoryId],
      foreignColumns: [categories.id],
      name: "Link_categoryId_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "Link_userId_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
  ],
);
