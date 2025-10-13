import { Pool } from 'pg';

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

export type ChatUser = {
  id: string;
  email: string;
  created_at: Date;
  updated_at: Date;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  sources?: Array<{
    id: string;
    title: string;
    category?: string;
    score: number;
  }>;
  created_at: Date;
};

export type ChatSession = {
  id: string;
  user_id: string;
  title?: string;
  created_at: Date;
  updated_at: Date;
};

export class ChatDB {
  // Ensure a user exists for the provided email, creating one if necessary.
  static async getOrCreateUserByEmail(email: string): Promise<ChatUser> {
    const existing = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
    if (existing.rows[0]) {
      return existing.rows[0] as ChatUser;
    }

    const created = await pool.query(
      'INSERT INTO users (email) VALUES ($1) RETURNING *',
      [email]
    );
    return created.rows[0] as ChatUser;
  }

  // Create a new chat session
  static async createSession(userId: string, title?: string): Promise<ChatSession> {
    const result = await pool.query(
      'INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING *',
      [userId, title || null]
    );
    return result.rows[0] as ChatSession;
  }

  // Get all sessions for a user
  static async getUserSessions(userId: string): Promise<ChatSession[]> {
    const result = await pool.query(
      'SELECT * FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );
    return result.rows as ChatSession[];
  }

  // Get a specific session
  static async getSession(sessionId: string, userId: string): Promise<ChatSession | null> {
    const result = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );
    return result.rows[0] as ChatSession || null;
  }

  // Update session title
  static async updateSessionTitle(sessionId: string, userId: string, title: string): Promise<void> {
    await pool.query(
      'UPDATE chat_sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3',
      [title, sessionId, userId]
    );
  }

  // Delete a session (will cascade delete messages)
  static async deleteSession(sessionId: string, userId: string): Promise<void> {
    await pool.query(
      'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );
  }

  // Add a message to a session
  static async addMessage(
    sessionId: string,
    role: 'system' | 'user' | 'assistant',
    content: string,
    sources?: ChatMessage['sources']
  ): Promise<ChatMessage> {
    const result = await pool.query(
      'INSERT INTO chat_messages (session_id, role, content, sources) VALUES ($1, $2, $3, $4) RETURNING *',
      [sessionId, role, content, sources ? JSON.stringify(sources) : null]
    );

    // Update session's updated_at timestamp
    await pool.query(
      'UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [sessionId]
    );

    return result.rows[0] as ChatMessage;
  }

  // Get all messages for a session
  static async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    const result = await pool.query(
      'SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId]
    );
    return result.rows as ChatMessage[];
  }

  // Delete a specific message
  static async deleteMessage(messageId: string): Promise<void> {
    await pool.query(
      'DELETE FROM chat_messages WHERE id = $1',
      [messageId]
    );
  }

  // Clear all messages in a session
  static async clearSessionMessages(sessionId: string): Promise<void> {
    await pool.query(
      'DELETE FROM chat_messages WHERE session_id = $1',
      [sessionId]
    );
  }
}
