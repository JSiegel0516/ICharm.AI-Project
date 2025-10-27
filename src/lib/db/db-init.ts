// src/lib/db-init.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import crypto from "crypto";
import {
  user,
  account,
  session,
  verification,
  chatSession,
  chatMessage,
} from "./schema";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

const db = drizzle(pool);

export async function initDb() {
  console.log("Initializing database...");

  // -------------------
  // 1️⃣ Sample user
  // -------------------
  const testUserId = crypto.randomUUID();
  await db.insert(user).values({
    id: testUserId,
    email: "test@example.com",
    name: "Test User",
    emailVerified: true,
    image: "https://i.pravatar.cc/150?img=3",
  }).onConflictDoNothing();

  // -------------------
  // 2️⃣ Sample OAuth account
  // -------------------
  const testAccountId = crypto.randomUUID();
  await db.insert(account).values({
    id: testAccountId,
    accountId: "github_test_account",
    providerId: "github",
    userId: testUserId,
    accessToken: "sample-access-token",
    refreshToken: "sample-refresh-token",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  // -------------------
  // 3️⃣ Sample session
  // -------------------
  const testSessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: testSessionId,
    token: "sample-session-token",
    userId: testUserId,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24h
    ipAddress: "127.0.0.1",
    userAgent: "Sample User Agent",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  // -------------------
  // 4️⃣ Sample verification
  // -------------------
  const testVerificationId = crypto.randomUUID();
  await db.insert(verification).values({
    id: testVerificationId,
    identifier: "test@example.com",
    value: "sample-verification-token",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1h
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  // -------------------
  // 5️⃣ Sample chat session
  // -------------------
  const testChatSessionId = crypto.randomUUID();
  await db.insert(chatSession).values({
    id: testChatSessionId,
    userId: testUserId,
    title: "Sample Chat Session",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  // -------------------
  // 6️⃣ Sample chat message
  // -------------------
  await db.insert(chatMessage).values({
    id: crypto.randomUUID(),
    sessionId: testChatSessionId,
    role: "system",
    content: "Welcome to your first chat!",
    sources: JSON.stringify([]),
    createdAt: new Date(),
  }).onConflictDoNothing();

  // -------------------
  // 7️⃣ Indexes
  // -------------------
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
  `);

  console.log("Database fully initialized with sample auth and chat data!");
}
