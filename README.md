# ICharm.AI-Project

AI-powered climate data exploration combining interactive visualization, tutorial guidance, and a local Retrieval-Augmented Generation (RAG) chatbot.

## Features
- 3D globe with selectable climate datasets and UI controls.
- Chat assistant backed by the Hugging Face router and Meta Llama 3.1 Instruct model.
- Lightweight RAG layer that injects tutorial context into the LLM.
- Local embedding pipeline (via `@xenova/transformers`) for tutorial content.

## Prerequisites
- Node.js 18+ and npm (or pnpm/yarn if you prefer).
- A Hugging Face access token with permission to run the target LLM.
- Optional (for embedding script): ability to download the `Xenova/all-MiniLM-L6-v2` model the first time the script runs.

## Installation
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` in the project root (same folder as `package.json`) and supply:
   ```ini
   # Chat backend
   LLAMA_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct
   LLAMA_API_KEY=hf_xxxxxxx            # or set HF_TOKEN
   ```
   Add any other app-specific settings you need (API base URL, etc.).

## Development
- Start the Next.js dev server:
  ```bash
  npm run dev
  ```
- Open <http://localhost:3000> to interact with the globe and chat UI.

## Generating Tutorial Embeddings
The RAG layer expects `src/data/tutorial/tutorialIndex.json`. To regenerate:

```bash
node src/components/Scripts/embedTutorial.js
```

This script:
1. Reads `src/data/tutorial/sections.json`.
2. Embeds each section with `@xenova/transformers`.
3. Writes the vectors to `src/data/tutorial/tutorialIndex.json`.

Re-run the script whenever the tutorial copy changes.

## Chatbot Flow
- The frontend (`ChatPage`) streams user messages to `/api/chat`.
- The backend route injects retrieved tutorial snippets and calls the Hugging Face Llama endpoint.
- Responses are returned as Server-Sent Events so the UI receives streamed updates.

## Troubleshooting
- If the chat route returns `404`, double-check the `LLAMA_MODEL` slug and verify your Hugging Face access.
- Ensure environment variables are loaded in the same shell that runs `npm run dev`.
- When embeddings fail, delete `src/data/tutorial/tutorialIndex.json` and rerun the embedding script to force a clean rebuild.
