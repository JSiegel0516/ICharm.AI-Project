import { NextRequest, NextResponse } from "next/server";
import { ChatDB, type ChatMessage } from "@/lib/db";

const TEST_USER_EMAIL =
  process.env.TEST_CHAT_USER_EMAIL ?? "test-user@icharm.local";

// Fix: params is now a Promise
type RouteParams = {
  params: Promise<{
    sessionId: string;
  }>;
};

type NormalizedMessage = {
  id: string;
  sessionId: string;
  role: ChatMessage["role"];
  content: string;
  sources?: ChatMessage["sources"];
  createdAt: string;
};

function normalizeMessage(message: ChatMessage): NormalizedMessage {
  // Handle date conversion with fallback
  let createdAtISO: string;

  try {
    if (message.createdAt instanceof Date) {
      // Already a Date object
      if (isNaN(message.createdAt.getTime())) {
        // Invalid Date object
        createdAtISO = new Date().toISOString();
      } else {
        createdAtISO = message.createdAt.toISOString();
      }
    } else if (typeof message.createdAt === "string") {
      // String - try to parse it
      const parsed = new Date(message.createdAt);
      if (isNaN(parsed.getTime())) {
        // Invalid date string
        createdAtISO = new Date().toISOString();
      } else {
        createdAtISO = parsed.toISOString();
      }
    } else if (typeof message.createdAt === "number") {
      // Unix timestamp
      const parsed = new Date(message.createdAt);
      if (isNaN(parsed.getTime())) {
        createdAtISO = new Date().toISOString();
      } else {
        createdAtISO = parsed.toISOString();
      }
    } else {
      // Unknown format - use current time
      createdAtISO = new Date().toISOString();
    }
  } catch (error) {
    console.error("Error parsing date for message", message.id, error);
    // Fallback to current time if all else fails
    createdAtISO = new Date().toISOString();
  }

  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    sources: message.sources ?? undefined,
    createdAt: createdAtISO,
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  // Await params directly in destructuring or here
  const { sessionId } = await params;

  if (!sessionId) {
    return NextResponse.json(
      { error: "Session id is required" },
      { status: 400 },
    );
  }

  try {
    const user = await ChatDB.getOrCreateUserByEmail(TEST_USER_EMAIL);
    const session = await ChatDB.getSession(sessionId, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const messages = await ChatDB.getSessionMessages(sessionId);

    return NextResponse.json({
      session,
      messages: messages.map(normalizeMessage),
    });
  } catch (error) {
    console.error("Failed to fetch session messages", error);
    return NextResponse.json(
      { error: "Failed to fetch session messages" },
      { status: 500 },
    );
  }
}
