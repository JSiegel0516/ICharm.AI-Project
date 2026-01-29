import { NextRequest } from "next/server";
import { ChatDB } from "@/lib/db";
import { ConversationContextPayload } from "@/types";

const TEST_USER_EMAIL =
  process.env.TEST_CHAT_USER_EMAIL ?? "test-user@icharm.local";
const LLM_SERVICE_URL = (
  process.env.LLM_SERVICE_URL ?? "http://localhost:8001"
).replace(/\/$/, "");

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatRequestPayload = {
  messages?: ChatMessage[];
  sessionId?: string | null;
  context?: ConversationContextPayload | null;
};

const normalizeString = (value?: string | null): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeNumber = (value?: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

type LocationSourceType = "marker" | "search" | "region" | "unknown";
const normalizeLocationSource = (
  value?: string | null,
): LocationSourceType | null => {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "marker" ||
    normalized === "search" ||
    normalized === "region" ||
    normalized === "unknown"
  ) {
    return normalized as LocationSourceType;
  }
  if (normalized === "manual" || normalized === "click") {
    return "marker";
  }
  return null;
};

const sanitizeConversationContext = (
  raw: unknown,
): ConversationContextPayload | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const ctx = raw as Record<string, any>;
  const locationRaw = ctx.location;
  let location: ConversationContextPayload["location"];

  if (locationRaw && typeof locationRaw === "object") {
    location = {
      latitude: normalizeNumber(locationRaw.latitude),
      longitude: normalizeNumber(locationRaw.longitude),
      name: normalizeString(locationRaw.name ?? locationRaw.label),
      source: normalizeLocationSource(
        locationRaw.source ?? locationRaw.origin ?? locationRaw.type,
      ),
    };
  }

  return {
    datasetId: normalizeString(ctx.datasetId),
    datasetName: normalizeString(ctx.datasetName) ?? undefined,
    datasetUnits: normalizeString(ctx.datasetUnits) ?? undefined,
    datasetDescription: normalizeString(ctx.datasetDescription) ?? undefined,
    datasetStartDate: normalizeString(ctx.datasetStartDate) ?? undefined,
    datasetEndDate: normalizeString(ctx.datasetEndDate) ?? undefined,
    selectedDate: normalizeString(ctx.selectedDate) ?? undefined,
    location,
  };
};

function isValidMessagesPayload(payload: unknown): payload is ChatMessage[] {
  if (!Array.isArray(payload)) {
    return false;
  }

  return payload.every(
    (item) =>
      item &&
      typeof item === "object" &&
      "role" in item &&
      "content" in item &&
      typeof (item as ChatMessage).role === "string" &&
      typeof (item as ChatMessage).content === "string",
  );
}

function findLastUserMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      return messages[i];
    }
  }
  return undefined;
}

function deriveSessionTitle(lastUserMessage?: ChatMessage): string | undefined {
  if (!lastUserMessage?.content) {
    return undefined;
  }

  const firstLine = lastUserMessage.content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return undefined;
  }

  const normalized = firstLine.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  const words = normalized.split(" ");
  const maxWords = 8;
  const title = words.slice(0, maxWords).join(" ");

  return words.length > maxWords ? `${title}…` : title;
}

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: ChatRequestPayload;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    messages,
    sessionId: incomingSessionId,
    context: rawContext,
  } = body ?? {};

  if (!isValidMessagesPayload(messages)) {
    return Response.json({ error: "Invalid chat payload" }, { status: 400 });
  }

  const conversationContext =
    sanitizeConversationContext(rawContext) ?? undefined;

  const sanitizedSessionId =
    typeof incomingSessionId === "string" && incomingSessionId.trim()
      ? incomingSessionId.trim()
      : null;

  const lastUserMessage = findLastUserMessage(messages);
  const userQuery = lastUserMessage?.content ?? "";

  let sessionId = sanitizedSessionId;
  let testUserId: string | null = null;

  if (userQuery) {
    try {
      const testUser = await ChatDB.getOrCreateUserByEmail(TEST_USER_EMAIL);
      testUserId = testUser.id;

      const candidateTitle = deriveSessionTitle(lastUserMessage);

      if (sessionId) {
        const existing = await ChatDB.getSession(sessionId, testUser.id);
        if (!existing) {
          const created = await ChatDB.createSession(
            testUser.id,
            candidateTitle,
          );
          sessionId = created.id;
        } else if (!existing.title && candidateTitle) {
          await ChatDB.updateSessionTitle(
            sessionId,
            testUser.id,
            candidateTitle,
          );
        }
      } else {
        const created = await ChatDB.createSession(testUser.id, candidateTitle);
        sessionId = created.id;
      }

      if (sessionId) {
        try {
          await ChatDB.addMessage(sessionId, "user", userQuery);
        } catch (messageError) {
          console.error("Failed to persist user message", messageError);
        }
      }
    } catch (bootstrapError) {
      console.error("Failed to bootstrap chat persistence", bootstrapError);
    }
  } else {
    console.warn(
      "No user message detected in payload; skipping persistence bootstrap.",
    );
  }

  try {
    const chatContext = conversationContext
      ? {
          currentDataset: conversationContext.datasetId
            ? {
                id: conversationContext.datasetId,
                name: conversationContext.datasetName,
              }
            : null,
          selectedLocation: conversationContext.location
            ? {
                name: conversationContext.location.name,
                lat: conversationContext.location.latitude,
                lng: conversationContext.location.longitude,
              }
            : null,
          selectedDate: conversationContext.selectedDate ?? null,
          timeRange:
            conversationContext.datasetStartDate ||
            conversationContext.datasetEndDate
              ? {
                  start: conversationContext.datasetStartDate ?? null,
                  end: conversationContext.datasetEndDate ?? null,
                }
              : null,
        }
      : null;

    const llmResponse = await fetch(`${LLM_SERVICE_URL}/v1/chat/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        context: chatContext,
        session_id: sessionId ?? undefined,
      }),
    });

    if (!llmResponse.ok) {
      const detail = await llmResponse.text();
      throw new Error(detail || "LLM service error");
    }

    const data = await llmResponse.json();
    const assistantMessage =
      typeof data?.message === "string" ? data.message : "";
    const toolCalls = Array.isArray(data?.tool_calls) ? data.tool_calls : [];

    if (sessionId && assistantMessage) {
      try {
        await ChatDB.addMessage(sessionId, "assistant", assistantMessage);
      } catch (assistantStoreError) {
        console.error(
          "Failed to persist assistant message",
          assistantStoreError,
        );
      }
    }

    return Response.json(
      {
        message: assistantMessage,
        sessionId: sessionId ?? undefined,
        toolCalls,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("LLM service call failed:", error);

    return Response.json(
      {
        error: "LLM request failed",
        details: (error as Error).message ?? "Unknown error from LLM service",
        sessionId: sessionId ?? undefined,
      },
      { status: 500 },
    );
  }
}
