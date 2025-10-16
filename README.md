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
   LLAMA_MODEL=meta-llama/Meta-Llama-3-8B-Instruct
   LLAMA_API_KEY=hf_xxxxxxx            # or set HF_TOKEN
   LLM_SERVICE_URL=http://localhost:8001
   POSTGRES_URL=postgres://icharm_user:icharm_dev_password@localhost:5432/icharm_chat
   POSTGRES_URL_NON_POOLING=postgres://icharm_user:icharm_dev_password@localhost:5432/icharm_chat
   ```
   Add any other app-specific settings you need (API base URL, etc.).

3. To generate embeddings, run:
node src/components/Scripts/embedTutorial.js
This will train the chatbot to gain information about the icharm website

## Database (Docker)

The PostgreSQL database boots in a Linux container so every developer gets the same schema, regardless of OS.

Install Docker before attempting to run the database

1. (Optional) Override defaults before starting the container by exporting the following in your shell or a `.env` file alongside `docker-compose.yml`:
   ```ini
   ICHARM_DB_USER=icharm_user
   ICHARM_DB_PASSWORD=icharm_dev_password
   ICHARM_DB_NAME=icharm_chat
   ICHARM_DB_PORT=5432
   ```
2. Start the database:
   ```bash
   docker compose up -d db
   docker compose down -v to clear and close container
   ```
   On first run the container executes `docker/postgres/init/00-init-db.sh`, which creates extensions, tables, triggers, indexes, and a sample `test@example.com` user.

   IMPORTANT: This may not work, if not run 
   docker compose exec db bash /docker-entrypoint-initdb.d/00-init-db.sh
   in project root to create correct table names in container


3. Verify connectivity from Node: (run from root)
   ```bash
   npx tsx src/components/Scripts/chat-db.ts
   ```

4. Use 
docker exec -it icharm-db psql -U icharm_user -d icharm_chat 
to go into a psql terminal.
Once in psql terminal, run:
SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 10;
to if database successfully initialized

5. Update/confirm the `POSTGRES_URL` values in `.env.local` match the credentials you used in step 1. The defaults match the connection string shown above.

Use `docker compose down` to stop the database or `docker compose down -v` to reset the data directory and re-run the initialization script.

## LLM Service (FastAPI)

- The FastAPI microservice wraps Hugging Face chat completions and runs alongside Postgres via Docker Compose.
- Configure the service with `HF_TOKEN`, `LLAMA_API_KEY`, `LLAMA_MODEL`, and `LLM_SERVICE_PORT` in `.env`. The Next.js API calls it through `LLM_SERVICE_URL`.
- Start it with:
  ```bash
  docker compose up -d llm-service
  ```
  or launch both database and service together: `docker compose up -d db llm-service`.
- Health check endpoint: <http://localhost:8001/health>. The chat endpoint lives at `/v1/chat`.
- The Next.js backend stores conversations in Postgres as before; the FastAPI service is stateless and can reach the database container if you later need direct access (same Docker network).

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

## Theming

## Important Packages

Cesium.js - globe implementation
Chart.js - timeseries chart visualization
Driver.js - animated tutorial tour (React Joyride dependencies not updated for React19)
pqoqubbw - animated icons
llama - open source llm for chatbot
