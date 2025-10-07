// app/api/chat/route.ts
import { NextRequest } from 'next/server';
import { retrieveRelevantContext, buildContextString } from '@/utils/ragRetriever';

const HF_MODEL =
  process.env.LLAMA_MODEL ?? 'meta-llama/Llama-3.1-8B-Instruct';
const HF_API_KEY =
  process.env.HF_TOKEN ?? process.env.LLAMA_API_KEY ?? '';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

export const maxDuration = 120; // Allow up to 120 seconds
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!HF_API_KEY) {
    return Response.json(
      { error: 'Missing HF API key' },
      { status: 500 }
    );
  }

  console.log('Token loaded:', HF_API_KEY ? `${HF_API_KEY.slice(0, 4)}...${HF_API_KEY.slice(-4)}` : 'MISSING');
  console.log('Using model:', HF_MODEL);

  const { messages } = await req.json();

  if (!isValidMessagesPayload(messages)) {
    return Response.json(
      { error: 'Invalid chat payload' },
      { status: 400 }
    );
  }

  // === RAG ENHANCEMENT START ===
  // Get the latest user message
  const lastUserMessage = messages[messages.length - 1];
  const userQuery = lastUserMessage?.content || '';

  let contextSources: Array<{
    id: string;
    title: string;
    category?: string;
    score: number;
  }> = [];
  let enhancedMessages = [...messages];

  // Retrieve relevant context (tutorial, about, or general)
  console.log('🔍 Analyzing query...');
  
  try {
    const { results: relevantSections, contextType } = await retrieveRelevantContext(userQuery, 3);
    
    if (relevantSections.length > 0) {
      console.log(`📚 Found ${relevantSections.length} relevant sections (${contextType})`);
      
      // Build context string
      const contextString = buildContextString(relevantSections, contextType as 'tutorial' | 'about');
      
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
  // === RAG ENHANCEMENT END ===

  try {
    // Use Hugging Face Inference Providers router
    const response = await fetch(
      'https://router.huggingface.co/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: HF_MODEL,
          messages: enhancedMessages, // Use enhanced messages with RAG context
          temperature: 0.6,
          stream: false,
        }),
      }
    );

    const contentType = response.headers.get('content-type');
    let result;
    
    if (contentType?.includes('application/json')) {
      result = await response.json();
    } else {
      const text = await response.text();
      result = { error: text };
    }

    if (!response.ok) {
      console.error('HF API error:', result);
      console.error('Status:', response.status);
      
      // Handle specific errors
      if (result.error) {
        return Response.json(
          {
            error: 'LLM request failed',
            details: typeof result.error === 'string' ? result.error : JSON.stringify(result.error),
          },
          { status: response.status }
        );
      }

      throw new Error(result.error || 'Unknown error from Hugging Face');
    }

    const completionText = result.choices?.[0]?.message?.content || '';

    if (!completionText) {
      return Response.json(
        { error: 'Empty response from model' },
        { status: 502 }
      );
    }

    console.log('✅ Success! Model response:', completionText);
    console.log('Provider used:', result.model);

    // Return plain JSON with sources if available
    return Response.json(
      { 
        content: completionText,
        sources: contextSources.length > 0 ? contextSources : undefined // Include sources if RAG was used
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('HF chat error:', error);
    
    return Response.json(
      {
        error: 'LLM request failed',
        details: (error as Error).message ?? 'Unknown error from Hugging Face',
      },
      { status: 500 }
    );
  }
}