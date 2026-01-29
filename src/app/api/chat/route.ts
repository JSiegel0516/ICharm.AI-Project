import { NextRequest } from "next/server";
import { ChatDB } from "@/lib/db";
import { ConversationContextPayload } from "@/types";

const HF_MODEL =
  process.env.LLAMA_MODEL ?? "meta-llama/Meta-Llama-3-8B-Instruct";
const TEST_USER_EMAIL =
  process.env.TEST_CHAT_USER_EMAIL ?? "test-user@icharm.local";
const LLM_SERVICE_URL = (
  process.env.LLM_SERVICE_URL ?? "http://localhost:8001"
).replace(/\/$/, "");
const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ?? "http://localhost:8000";

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

function detectProblematicResponse(
  response: string,
  contextSources: Array<{ title: string }>,
): { hasIssues: boolean; issues: string[] } {
  const issues: string[] = [];
  const lower = response.toLowerCase();

  const methodologyPhrases = [
    "i will calculate",
    "i will analyze",
    "methodology:",
    "i can suggest that you examine",
    "i would extract",
    "we can estimate",
    "based on the linear trend",
  ];

  for (const phrase of methodologyPhrases) {
    if (lower.includes(phrase)) {
      issues.push(`Contains methodology language: "${phrase}"`);
    }
  }

  const contextMentions = [
    "the provided context",
    "based on the available data",
    "the dataset does not provide",
    "the context does not include",
  ];

  for (const mention of contextMentions) {
    if (lower.includes(mention)) {
      issues.push(`Mentions context explicitly: "${mention}"`);
    }
  }

  // Check for unhelpful refusals when data is actually present
  const hasNumber = /\d+\.?\d*\s*(°c|degc|degrees|celsius|degk|kelvin)/i.test(
    response,
  );

  if (
    (lower.includes("no dataset information") ||
      lower.includes("not available") ||
      lower.includes("i don't have")) &&
    !hasNumber &&
    response.length < 200
  ) {
    issues.push("Refusing to answer when data may be available");
  }

  return {
    hasIssues: issues.length > 0,
    issues,
  };
}

async function callLLMWithRetry(
  llmServiceUrl: string,
  hfModel: string,
  messages: ChatMessage[],
  maxRetries = 1,
): Promise<{ content: string; model?: string }> {
  let lastResponse = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const llmResponse = await fetch(`${llmServiceUrl}/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: hfModel,
        messages,
        temperature: attempt > 0 ? 0.3 : 0.5,
        stream: false,
      }),
    });

    if (!llmResponse.ok) {
      const contentType = llmResponse.headers.get("content-type") ?? "";
      let result: any;

      if (contentType.includes("application/json")) {
        result = await llmResponse.json();
      } else {
        const text = await llmResponse.text();
        result = { detail: text };
      }

      let detail: string;
      if (typeof result?.detail === "string") {
        detail = result.detail;
      } else if (result?.detail && typeof result.detail === "object") {
        const innerDetail = result.detail as Record<string, unknown>;
        if (typeof innerDetail.error === "string") {
          const statusInfo = innerDetail.status
            ? ` (status ${innerDetail.status})`
            : "";
          detail = `${innerDetail.error}${statusInfo}`;
          if (typeof innerDetail.body === "string" && innerDetail.body.trim()) {
            detail += `: ${innerDetail.body.slice(0, 240)}${innerDetail.body.length > 240 ? "…" : ""}`;
          }
        } else {
          detail = JSON.stringify(innerDetail);
        }
      } else if (result?.error) {
        detail =
          typeof result.error === "string"
            ? result.error
            : JSON.stringify(result.error);
      } else {
        detail = "LLM service error";
      }

      throw new Error(detail);
    }

    const result = await llmResponse.json();
    const content = typeof result?.content === "string" ? result.content : "";

    if (!content.trim()) {
      throw new Error("Empty response from model");
    }

    lastResponse = content;

    const validation = detectProblematicResponse(content, []);

    if (!validation.hasIssues || attempt === maxRetries) {
      return {
        content,
        model: result?.model || result?.raw?.model,
      };
    }

    console.warn(
      `Response has issues (attempt ${attempt + 1}):`,
      validation.issues,
    );
    messages.push(
      { role: "assistant", content },
      {
        role: "user",
        content: `Please revise. The data IS provided above - use it to answer directly. ${validation.issues.join("; ")}. Answer in 1-3 sentences using the actual numbers from the data.`,
      },
    );
  }

  return { content: lastResponse };
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

  const contextSources: Array<{
    id: string;
    title: string;
    category?: string;
    score: number;
  }> = [];
  let enhancedMessages = [...messages];

  void conversationContext;
  void DATA_SERVICE_URL;

  try {
    const { content: assistantMessage, model: providerModel } =
      await callLLMWithRetry(LLM_SERVICE_URL, HF_MODEL, enhancedMessages, 1);

    console.log("[llm] Success! Model response:", assistantMessage);
    if (providerModel) {
      console.log("[llm] Provider used:", providerModel);
    }

    if (sessionId && assistantMessage) {
      try {
        await ChatDB.addMessage(
          sessionId,
          "assistant",
          assistantMessage,
          contextSources.length > 0 ? contextSources : undefined,
        );
      } catch (assistantStoreError) {
        console.error(
          "Failed to persist assistant message",
          assistantStoreError,
        );
      }
    }

    return Response.json(
      {
        content: assistantMessage,
        sources: contextSources.length > 0 ? contextSources : undefined,
        sessionId: sessionId ?? undefined,
        model: providerModel,
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
