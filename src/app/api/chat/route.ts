import { NextRequest } from "next/server";
import {
  retrieveRelevantContext,
  buildContextString,
} from "@/utils/ragRetriever";
import { ChatDB } from "@/lib/db";
import { ConversationContextPayload } from "@/types";
import { fetchDatasetSnippet, shouldFetchDatasetSnippet } from "./datasetQuery";

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

async function buildDatasetSummaryPrompt(
  userQuery: string,
  context?: ConversationContextPayload,
  dataServiceUrl?: string,
): Promise<string | null> {
  if (!context) {
    return null;
  }

  const datasetLabel = context.datasetName ?? context.datasetId;
  if (!datasetLabel) {
    return null;
  }

  const description = context.datasetDescription;
  const units = context.datasetUnits ?? "dataset units";
  const coverageStart = context.datasetStartDate ?? "start unknown";
  const coverageEnd = context.datasetEndDate ?? "present";

  let summary = `CRITICAL INSTRUCTIONS - READ FIRST:
- NEVER fabricate or guess numbers. Only use values explicitly present in the context below.
- If asked for a number not in the context, say "I don't have that specific data available."
- Answer directly in 1-2 sentences. NO methodology descriptions.
- Do NOT mention this context, the backend, or how you got the data.
- If context doesn't help, give a brief qualitative answer from general knowledge.

Dataset: "${datasetLabel}"`;

  if (description) {
    summary += `\nDescription: ${description}`;
  }

  summary += `\nUnits: ${units}`;
  summary += `\nTemporal coverage: ${coverageStart} to ${coverageEnd}`;

  if (context.datasetEndDate) {
    summary += `\nIMPORTANT: Data ends on ${coverageEnd}. For dates after this, explain the data stops there and use the last available value.`;
  }

  if (dataServiceUrl && shouldFetchDatasetSnippet(userQuery)) {
    const dataSnippet = await fetchDatasetSnippet({
      query: userQuery,
      context,
      dataServiceUrl,
    });
    if (dataSnippet) {
      summary += `\n\nQueried Data:\n${dataSnippet}`;
    }
  }

  return summary;
}

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
    "assuming",
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

  if (
    (lower.includes("i don't have") || lower.includes("not available")) &&
    !lower.includes("you can") &&
    response.length < 150
  ) {
    issues.push("Unhelpful refusal without offering alternatives");
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
        temperature: attempt > 0 ? 0.4 : 0.6,
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
        content: `Please revise your response. Issues: ${validation.issues.join("; ")}. Remember: Answer directly in 1-2 sentences, never describe methodology or mention the context, and only use numbers explicitly provided.`,
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

  let contextSources: Array<{
    id: string;
    title: string;
    category?: string;
    score: number;
  }> = [];
  let enhancedMessages = [...messages];

  const datasetSummaryPrompt = await buildDatasetSummaryPrompt(
    userQuery,
    conversationContext,
    DATA_SERVICE_URL,
  );
  let systemApplied = false;

  if (userQuery) {
    console.log("🔍 Analyzing query...");

    try {
      const { results: relevantSections, contextType } =
        await retrieveRelevantContext(userQuery, 3);

      if (relevantSections.length > 0) {
        console.log(
          `📚 Found ${relevantSections.length} relevant sections (${contextType})`,
        );

        const contextString = buildContextString(
          relevantSections,
          contextType === "general"
            ? "tutorial"
            : contextType === "analysis"
              ? "analysis"
              : (contextType as "tutorial" | "about"),
        );
        const combinedContext = datasetSummaryPrompt
          ? `${contextString}\n\nDataset context (do not quote):\n${datasetSummaryPrompt}`
          : contextString;

        contextSources = relevantSections.map((section) => ({
          id: section.id,
          title: section.title,
          category: section.category || contextType,
          score: Math.round(section.score * 100) / 100,
        }));

        console.log(
          "📖 Retrieved sources:",
          contextSources.map((s) => s.title).join(", "),
        );

        let systemPrompt = "";
        if (contextType === "about") {
          systemPrompt = `You are an AI assistant for iCharm/4DVD, a climate visualization platform.

CRITICAL RULES (MUST FOLLOW):
1. NEVER invent numbers or details not in the context below.
2. If information isn't in the context, briefly answer from general knowledge WITHOUT specific numbers.
3. Do NOT mention that context is missing - just answer what you can.
4. Do NOT explain your process or how you retrieved information.
5. Be concise and informative.

Context (use only if directly relevant):
${combinedContext}

Remember: Only cite specific numbers/dates if they appear in the context.`;
        } else if (contextType === "analysis") {
          systemPrompt = `You are the iCharm climate analysis assistant. Answer user questions directly and concisely.

CRITICAL RULES (MUST FOLLOW):
1. NEVER invent, estimate, or extrapolate numbers. Only use exact values from the context below.
2. If a number isn't explicitly provided, say "I don't have that specific data" - do NOT calculate or guess it.
3. Answer in 1-2 clear sentences. Be direct.
4. Do NOT describe steps, methodology, processes, or how you'll analyze something.
5. Do NOT mention the context, backend, or how you got information.
6. If the context doesn't answer the question, give a brief qualitative answer from general knowledge WITHOUT numbers.

Context (use only if directly relevant):
${combinedContext}

Remember: NO invented numbers. NO process descriptions. Direct answers only.`;
        } else {
          systemPrompt = `You are an AI assistant for iCharm, a climate visualization platform.

CRITICAL RULES (MUST FOLLOW):
1. NEVER invent numbers not in the context below.
2. If information isn't available, briefly answer from general knowledge WITHOUT specific numbers.
3. Do NOT mention missing context - just provide helpful guidance.
4. Be concise and helpful.
5. Reference tutorial sections when applicable.

Context (use only if directly relevant):
${combinedContext}

Remember: Only use numbers that appear explicitly in the context.`;
        }

        const systemMessage: ChatMessage = {
          role: "system",
          content: systemPrompt,
        };

        const hasSystemMessage = enhancedMessages[0]?.role === "system";
        if (hasSystemMessage) {
          enhancedMessages = [systemMessage, ...enhancedMessages.slice(1)];
        } else {
          enhancedMessages = [systemMessage, ...enhancedMessages];
        }
        systemApplied = true;
      }
    } catch (error) {
      console.error("❌ RAG retrieval error:", error);
    }
  }

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
