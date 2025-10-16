import { NextRequest } from 'next/server';
import { retrieveRelevantContext, buildContextString } from '@/utils/ragRetriever';
import { ChatDB } from '@/lib/db';

const HF_MODEL =
  process.env.LLAMA_MODEL ?? 'meta-llama/Meta-Llama-3-8B-Instruct';
const TEST_USER_EMAIL =
  process.env.TEST_CHAT_USER_EMAIL ?? 'test-user@icharm.local';
const LLM_SERVICE_URL =
  (process.env.LLM_SERVICE_URL ?? 'http://localhost:8001').replace(/\/$/, '');

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatRequestPayload = {
  messages?: ChatMessage[];
  sessionId?: string | null;
};

function isValidMessagesPayload(payload: unknown): payload is ChatMessage[] {
  if (!Array.isArray(payload)) {
    return false;
  }

  return payload.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      'role' in item &&
      'content' in item &&
      typeof (item as ChatMessage).role === 'string' &&
      typeof (item as ChatMessage).content === 'string'
  );
}

function findLastUserMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
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
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return undefined;
  }

  const normalized = firstLine.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  const words = normalized.split(' ');
  const maxWords = 8;
  const title = words.slice(0, maxWords).join(' ');

  return words.length > maxWords ? `${title}…` : title;
}

export const maxDuration = 120; // Allow up to 120 seconds
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: ChatRequestPayload;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { messages, sessionId: incomingSessionId } = body ?? {};

  if (!isValidMessagesPayload(messages)) {
    return Response.json(
      { error: 'Invalid chat payload' },
      { status: 400 }
    );
  }

  const sanitizedSessionId =
    typeof incomingSessionId === 'string' && incomingSessionId.trim()
      ? incomingSessionId.trim()
      : null;

  // === RAG ENHANCEMENT START ===
  // Get the latest user message
  const lastUserMessage = findLastUserMessage(messages);
  const userQuery = lastUserMessage?.content ?? '';

  let contextSources: Array<{
    id: string;
    title: string;
    category?: string;
    score: number;
  }> = [];
  let enhancedMessages = [...messages];

  if (userQuery) {
    console.log('🔍 Analyzing query...');

    try {
      const { results: relevantSections, contextType } = await retrieveRelevantContext(userQuery, 3);

      if (relevantSections.length > 0) {
        console.log(`📚 Found ${relevantSections.length} relevant sections (${contextType})`);

        // Build context string
        const contextString = buildContextString(
          relevantSections,
          contextType === 'general' ? 'tutorial' : (contextType as 'tutorial' | 'about')
        );

        // Store sources for response
        contextSources = relevantSections.map(section => ({
          id: section.id,
          title: section.title,
          category: section.category || contextType,
          score: Math.round(section.score * 100) / 100
        }));

        console.log('📖 Retrieved sources:', contextSources.map(s => s.title).join(', '));

        // Create appropriate system message based on context type
        let systemPrompt = '';
        if (contextType === 'about') {
          systemPrompt = `You are an AI assistant for iCharm/4DVD, a climate visualization platform. Use the following context about the platform's history, development, and information to answer the user's question.

${contextString}

Instructions:
- Be informative and accurate based on the provided context
- Reference specific details when applicable (names, dates, citations)
- If asked about licensing or technical details, be precise
- If the answer is not in the context, acknowledge that and offer general guidance
- Use a professional, informative tone`;
        } else {
          systemPrompt = `You are an AI assistant for iCharm, a climate visualization platform. Use the following context from the tutorial to answer the user's question.

${contextString}

Instructions:
- Be concise and helpful
- Reference the relevant tutorial sections when applicable
- Provide step-by-step guidance for how-to questions
- If the user asks about features not covered in the context, acknowledge that and provide general guidance
- Use a friendly, professional tone`;
        }

        const systemMessage: ChatMessage = {
          role: 'system',
          content: systemPrompt
        };

        // Insert system message at the beginning or update existing system message
        const hasSystemMessage = messages[0]?.role === 'system';
        if (hasSystemMessage) {
          enhancedMessages = [systemMessage, ...messages.slice(1)];
        } else {
          enhancedMessages = [systemMessage, ...messages];
        }
      }
    } catch (error) {
      console.error('❌ RAG retrieval error:', error);
      // Continue without RAG enhancement if it fails
    }
  }
  // === RAG ENHANCEMENT END ===

  let sessionId = sanitizedSessionId;
  let testUserId: string | null = null;

  if (lastUserMessage?.content) {
    try {
      const testUser = await ChatDB.getOrCreateUserByEmail(TEST_USER_EMAIL);
      testUserId = testUser.id;

      const candidateTitle = deriveSessionTitle(lastUserMessage);

      if (sessionId) {
        const existing = await ChatDB.getSession(sessionId, testUser.id);
        if (!existing) {
          const created = await ChatDB.createSession(testUser.id, candidateTitle);
          sessionId = created.id;
        } else if (!existing.title && candidateTitle) {
          await ChatDB.updateSessionTitle(sessionId, testUser.id, candidateTitle);
        }
      } else {
        const created = await ChatDB.createSession(testUser.id, candidateTitle);
        sessionId = created.id;
      }

      if (sessionId) {
        try {
          await ChatDB.addMessage(sessionId, 'user', lastUserMessage.content);
        } catch (messageError) {
          console.error('Failed to persist user message', messageError);
        }
      }
    } catch (bootstrapError) {
      console.error('Failed to bootstrap chat persistence', bootstrapError);
    }
  } else {
    console.warn('No user message detected in payload; skipping persistence bootstrap.');
  }

  try {
    const llmResponse = await fetch(`${LLM_SERVICE_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: enhancedMessages, // Use enhanced messages with RAG context
        temperature: 0.6,
        stream: false,
      }),
    });

    const contentType = llmResponse.headers.get('content-type') ?? '';
    let result: any;

    if (contentType.includes('application/json')) {
      result = await llmResponse.json();
    } else {
      const text = await llmResponse.text();
      result = { detail: text };
    }

    if (!llmResponse.ok) {
      let detail: string;
      if (typeof result?.detail === 'string') {
        detail = result.detail;
      } else if (result?.detail && typeof result.detail === 'object') {
        const innerDetail = result.detail as Record<string, unknown>;
        if (typeof innerDetail.error === 'string') {
          const statusInfo = innerDetail.status ? ` (status ${innerDetail.status})` : '';
          detail = `${innerDetail.error}${statusInfo}`;
          if (typeof innerDetail.body === 'string' && innerDetail.body.trim()) {
            detail += `: ${innerDetail.body.slice(0, 240)}${innerDetail.body.length > 240 ? '…' : ''}`;
          }
        } else {
          detail = JSON.stringify(innerDetail);
        }
      } else if (result?.error) {
        detail =
          typeof result.error === 'string'
            ? result.error
            : JSON.stringify(result.error);
      } else {
        detail = 'LLM service error';
      }

      console.error('LLM service error:', detail);

      return Response.json(
        {
          error: 'LLM request failed',
          details: detail,
          sessionId: sessionId ?? undefined,
        },
        { status: llmResponse.status }
      );
    }

    const completionText =
      typeof result?.content === 'string' ? result.content : '';

    if (!completionText.trim()) {
      return Response.json(
        { error: 'Empty response from model', sessionId: sessionId ?? undefined },
        { status: 502 }
      );
    }

    const providerModel =
      typeof result?.model === 'string'
        ? result.model
        : typeof result?.raw?.model === 'string'
          ? result.raw.model
          : undefined;

    console.log('[llm] Success! Model response:', completionText);
    if (providerModel) {
      console.log('[llm] Provider used:', providerModel);
    }

    if (sessionId && completionText) {
      try {
        await ChatDB.addMessage(
          sessionId,
          'assistant',
          completionText,
          contextSources.length > 0 ? contextSources : undefined
        );
      } catch (assistantStoreError) {
        console.error('Failed to persist assistant message', assistantStoreError);
      }
    }

    return Response.json(
      {
        content: completionText,
        sources: contextSources.length > 0 ? contextSources : undefined,
        sessionId: sessionId ?? undefined,
        model: providerModel,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('LLM service call failed:', error);

    return Response.json(
      {
        error: 'LLM request failed',
        details: (error as Error).message ?? 'Unknown error from LLM service',
        sessionId: sessionId ?? undefined,
      },
      { status: 500 }
    );
  }
}
