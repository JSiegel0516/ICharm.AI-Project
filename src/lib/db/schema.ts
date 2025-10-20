import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------
// User Table
// ---------------------------
export const user = pgTable("users", {
  id: text("id").primaryKey(), // use UUID in code
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// ---------------------------
// Account Table (OAuth, etc.)
// ---------------------------
export const account = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// ---------------------------
// Session Table
// ---------------------------
export const session = pgTable("sessions", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// ---------------------------
// Verification Table
// ---------------------------
export const verification = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// ---------------------------
// Chat Sessions Table
// ---------------------------
export const chatSession = pgTable("chat_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// ---------------------------
// Chat Messages Table
// ---------------------------
export const chatMessage = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => chatSession.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // enforce 'system' | 'user' | 'assistant' in TS
  content: text("content").notNull(),
  sources: jsonb("sources"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------
// Relations
// ---------------------------
export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  sessions: many(session),
  chatSessions: many(chatSession),
}));

export const chatSessionRelations = relations(chatSession, ({ many, one }) => ({
  messages: many(chatMessage),
  user: one(user, { fields: [chatSession.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

