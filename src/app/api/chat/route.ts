// app/api/chat/route.ts
import { NextRequest } from 'next/server';
import { retrieveRelevantSections, buildContextString, isTutorialQuery } from '@/utils/ragRetriever';

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

  // Check if this is a tutorial-related query
  const isAboutTutorial = isTutorialQuery(userQuery);
  
  let contextSources: any[] = [];
  let enhancedMessages = [...messages];

  // If it's tutorial-related, retrieve relevant sections
  if (isAboutTutorial) {
    console.log('📚 Tutorial query detected, retrieving relevant sections...');
    
    try {
      const relevantSections = await retrieveRelevantSections(userQuery, 3);
      console.log(`✅ Found ${relevantSections.length} relevant sections`);
      
      if (relevantSections.length > 0) {
        // Build context string
        const contextString = buildContextString(relevantSections);
        
        // Store sources for response
        contextSources = relevantSections.map(section => ({
          id: section.id,
          title: section.title,
          score: Math.round(section.score * 100) / 100 // Round to 2 decimals
        }));
        
        console.log('📖 Retrieved sources:', contextSources.map(s => s.title).join(', '));
        
        // Add system message with context
        const systemMessage: ChatMessage = {
          role: 'system',
          content: `You are an AI assistant for iCharm, a climate visualization platform. Use the following context from the tutorial to answer the user's question. If the answer is not in the context, say you don't have that specific information but offer to help with general guidance.

${contextString}

Instructions:
- Be concise and helpful
- Reference the relevant tutorial sections when applicable
- If the user asks about features not covered in the context, acknowledge that and provide general guidance
- Use a friendly, professional tone`
        };
        
        // Insert system message at the beginning or update existing system message
        const hasSystemMessage = messages[0]?.role === 'system';
        if (hasSystemMessage) {
          // Replace existing system message
          enhancedMessages = [
            systemMessage,
            ...messages.slice(1)
          ];
        } else {
          // Add new system message at the start
          enhancedMessages = [
            systemMessage,
            ...messages
          ];
        }
      }
    } catch (error) {
      console.error('❌ RAG retrieval error:', error);
      // Continue without RAG enhancement if it fails
    }
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