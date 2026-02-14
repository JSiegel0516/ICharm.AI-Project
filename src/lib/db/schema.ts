import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------
// User Table
// ---------------------------
export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ---------------------------
// Account Table (OAuth, etc.)
// ---------------------------
export const account = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ---------------------------
// Session Table
// ---------------------------
export const session = pgTable("sessions", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ---------------------------
// Verification Table
// ---------------------------
export const verification = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------
// Chat Sessions Table
// ---------------------------
export const chatSession = pgTable("chat_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ---------------------------
// Chat Messages Table
// ---------------------------
export const chatMessage = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => chatSession.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  sources: jsonb("sources"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------
// Climate Datasets Table (matches metadata.csv EXACTLY + slug field)
// ---------------------------
export const climateDataset = pgTable("metadata", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  sourceName: text("sourceName").notNull(),
  datasetName: text("datasetName").notNull(),
  layerParameter: text("layerParameter").notNull(),
  statistic: text("statistic").notNull(),
  datasetType: text("datasetType").notNull(),
  levels: text("levels").notNull(),
  levelValues: text("levelValues"), // nullable - can be "None"
  levelUnits: text("levelUnits"), // nullable - can be "None"
  stored: text("stored").notNull(), // "local" or "cloud" 
  inputFile: text("inputFile").notNull(),
  keyVariable: text("keyVariable").notNull(),
  units: text("units").notNull(),
  spatialResolution: text("spatialResolution").notNull(),
  engine: text("engine").notNull(),
  kerchunkPath: text("kerchunkPath"), // nullable - can be "None"
  origLocation: text("origLocation").notNull(),
  startDate: text("startDate").notNull(), // stored as text: "1854/1/1"
  endDate: text("endDate").notNull(), // stored as text: "9/1/2025" or "present"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
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
