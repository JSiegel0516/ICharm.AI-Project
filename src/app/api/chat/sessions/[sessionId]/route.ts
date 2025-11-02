import { NextRequest, NextResponse } from "next/server";
import { ChatDB } from "@/lib/db";

const TEST_USER_EMAIL =
  process.env.TEST_CHAT_USER_EMAIL ?? "test-user@icharm.local";

type RouteParams = {
  params: {
    sessionId: string;
  };
};

export async function PATCH(request: NextRequest, ctx: RouteParams) {
  const params = await ctx.params;
  const sessionId = params?.sessionId;

  if (!sessionId) {
    return NextResponse.json(
      { error: "Session id is required" },
      { status: 400 },
    );
  }

  try {
    const user = await ChatDB.getOrCreateUserByEmail(TEST_USER_EMAIL);
    const existing = await ChatDB.getSession(sessionId, user.id);

    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let payload: { title?: string } = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    if (!payload.title || !payload.title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    await ChatDB.updateSessionTitle(sessionId, user.id, payload.title.trim());

    const updated = await ChatDB.getSession(sessionId, user.id);

    return NextResponse.json({
      session: updated,
    });
  } catch (error) {
    console.error("Failed to rename session", error);
    return NextResponse.json(
      { error: "Failed to rename session" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteParams) {
  const params = await ctx.params;
  const sessionId = params?.sessionId;

  if (!sessionId) {
    return NextResponse.json(
      { error: "Session id is required" },
      { status: 400 },
    );
  }

  try {
    const user = await ChatDB.getOrCreateUserByEmail(TEST_USER_EMAIL);
    await ChatDB.deleteSession(sessionId, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete session", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 },
    );
  }
}
