import { NextRequest } from 'next/server';

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

export async function POST(req: NextRequest) {
  if (!HF_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Missing HF API key' }),
      { status: 500 }
    );
  }

  console.log('Token loaded:', HF_API_KEY ? `${HF_API_KEY.slice(0, 4)}...${HF_API_KEY.slice(-4)}` : 'MISSING');
  console.log('Using model:', HF_MODEL);

  const { messages } = await req.json();

  if (!isValidMessagesPayload(messages)) {
    return new Response(
      JSON.stringify({ error: 'Invalid chat payload' }),
      { status: 400 }
    );
  }

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
          messages,
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
        return new Response(
          JSON.stringify({
            error: 'LLM request failed',
            details: typeof result.error === 'string' ? result.error : JSON.stringify(result.error),
          }),
          { status: response.status }
        );
      }

      throw new Error(result.error || 'Unknown error from Hugging Face');
    }

    const completionText = result.choices?.[0]?.message?.content || '';

    if (!completionText) {
      return new Response(
        JSON.stringify({ error: 'Empty response from model' }),
        { status: 502 }
      );
    }

    console.log('✅ Success! Model response:', completionText);
    console.log('Provider used:', result.model);

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    await writer.write(
      encoder.encode(
        `data: ${JSON.stringify({ content: completionText })}\n\n`
      )
    );
    await writer.close();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('HF chat error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'LLM request failed',
        details: (error as Error).message ?? 'Unknown error from Hugging Face',
      }),
      { status: 500 }
    );
  }
}