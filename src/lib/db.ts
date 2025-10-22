import { db } from './db/index';
import { user, chatSession, chatMessage } from './db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export type ChatSession = {
  id: string;
  userId: string;      // Changed from user_id
  title?: string;
  createdAt: Date;     // Changed from created_at
  updatedAt: Date;     // Changed from updated_at
};

export type ChatUser = {
  id: string;
  email: string;
  createdAt: Date;     // Changed from created_at
  updatedAt: Date;     // Changed from updated_at
};

export type ChatMessage = {
  id: string;
  sessionId: string;   // Changed from session_id
  role: 'system' | 'user' | 'assistant';
  content: string;
  sources?: Array<{
    id: string;
    title: string;
    category?: string;
    score: number;
  }>;
  createdAt: Date;     // Changed from created_at
};

export class ChatDB {
  // Ensure a user exists for the provided email, creating one if necessary.
  static async getOrCreateUserByEmail(email: string): Promise<ChatUser> {
    const existing = await db.select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existing.length > 0) {
      return existing[0] as ChatUser;
    }

    const created = await db.insert(user)
      .values({
        id: randomUUID(),
        email: email,
        emailVerified: false,
      })
      .returning();

    return created[0] as ChatUser;
  }

  // Create a new chat session
  static async createSession(userId: string, title?: string): Promise<ChatSession> {
    const result = await db.insert(chatSession)
      .values({
        id: randomUUID(),
        userId: userId,
        title: title || null,
      })
      .returning();

    return result[0] as ChatSession;
  }

  // Get all sessions for a user
  static async getUserSessions(userId: string): Promise<ChatSession[]> {
    const result = await db.select()
      .from(chatSession)
      .where(eq(chatSession.userId, userId))
      .orderBy(desc(chatSession.updatedAt));

    return result as ChatSession[];
  }

  // Get a specific session
  static async getSession(sessionId: string, userId: string): Promise<ChatSession | null> {
    const result = await db.select()
      .from(chatSession)
      .where(
        and(
          eq(chatSession.id, sessionId),
          eq(chatSession.userId, userId)
        )
      )
      .limit(1);

    return result.length > 0 ? result[0] as ChatSession : null;
  }

  // Update session title
  static async updateSessionTitle(sessionId: string, userId: string, title: string): Promise<void> {
    await db.update(chatSession)
      .set({ 
        title: title,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(chatSession.id, sessionId),
          eq(chatSession.userId, userId)
        )
      );
  }

  // Delete a session (will cascade delete messages)
  static async deleteSession(sessionId: string, userId: string): Promise<void> {
    await db.delete(chatSession)
      .where(
        and(
          eq(chatSession.id, sessionId),
          eq(chatSession.userId, userId)
        )
      );
  }

  // Add a message to a session
  static async addMessage(
    sessionId: string,
    role: 'system' | 'user' | 'assistant',
    content: string,
    sources?: ChatMessage['sources']
  ): Promise<ChatMessage> {
    const result = await db.insert(chatMessage)
      .values({
        id: randomUUID(),
        sessionId: sessionId,
        role: role,
        content: content,
        sources: sources || null,
      })
      .returning();

    // Update session's updated_at timestamp
    await db.update(chatSession)
      .set({ updatedAt: new Date() })
      .where(eq(chatSession.id, sessionId));

    return result[0] as ChatMessage;
  }

  // Get all messages for a session
  static async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    const result = await db.select()
      .from(chatMessage)
      .where(eq(chatMessage.sessionId, sessionId))
      .orderBy(chatMessage.createdAt);

    return result as ChatMessage[];
  }

  // Delete a specific message
  static async deleteMessage(messageId: string): Promise<void> {
    await db.delete(chatMessage)
      .where(eq(chatMessage.id, messageId));
  }

  // Clear all messages in a session
  static async clearSessionMessages(sessionId: string): Promise<void> {
    await db.delete(chatMessage)
      .where(eq(chatMessage.sessionId, sessionId));
  }
}