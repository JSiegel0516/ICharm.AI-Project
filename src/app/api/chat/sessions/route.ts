import { NextRequest, NextResponse } from 'next/server';
import { ChatDB, type ChatSession } from '@/lib/db';

const TEST_USER_EMAIL =
  process.env.TEST_CHAT_USER_EMAIL ?? 'test-user@icharm.local';

type NormalizedSession = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

function normalizeSession(session: ChatSession): NormalizedSession {
  return {
    id: session.id,
    title: session.title ?? null,
    createdAt: session.created_at instanceof Date
      ? session.created_at.toISOString()
      : new Date(session.created_at).toISOString(),
    updatedAt: session.updated_at instanceof Date
      ? session.updated_at.toISOString()
      : new Date(session.updated_at).toISOString(),
  };
}

export async function GET() {
  try {
    const user = await ChatDB.getOrCreateUserByEmail(TEST_USER_EMAIL);
    const sessions = await ChatDB.getUserSessions(user.id);

    return NextResponse.json({
      sessions: sessions.map(normalizeSession),
    });
  } catch (error) {
    console.error('Failed to fetch chat sessions', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat sessions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ChatDB.getOrCreateUserByEmail(TEST_USER_EMAIL);

    let payload: { title?: string } = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    const created = await ChatDB.createSession(
      user.id,
      payload.title?.trim() ? payload.title.trim() : undefined
    );

    return NextResponse.json({
      session: normalizeSession(created),
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to create chat session', error);
    return NextResponse.json(
      { error: 'Failed to create chat session' },
      { status: 500 }
    );
  }
}
