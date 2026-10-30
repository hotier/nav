import { relations } from "drizzle-orm";
import {
  accounts,
  categories,
  links,
  sessions,
  users,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  links: many(links),
  categories: many(categories),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "CategoryToCategory",
  }),
  children: many(categories, { relationName: "CategoryToCategory" }),
  links: many(links),
  user: one(users, {
    fields: [categories.userId],
    references: [users.id],
  }),
}));

export const linksRelations = relations(links, ({ one }) => ({
  category: one(categories, {
    fields: [links.categoryId],
    references: [categories.id],
  }),
  user: one(users, {
    fields: [links.userId],
    references: [users.id],
  }),
}));
