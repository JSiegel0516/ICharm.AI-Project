# ICharm.AI-Project

AI-powered climate data exploration combining interactive visualization, tutorial guidance, and a local Retrieval-Augmented Generation (RAG) chatbot.

## Features

- 3D globe with selectable climate datasets and UI controls.
- Chat assistant backed by the Hugging Face router and Meta Llama 3.1 Instruct model.
- Lightweight RAG layer that injects tutorial context into the LLM.
- Local embedding pipeline (via `@xenova/transformers`) for tutorial content.
- Time series page for data set analysis

## Prerequisites

- Node.js 18+ and npm (or pnpm/yarn if you prefer).
- A Hugging Face access token with permission to run the target LLM.
- Optional (for embedding script): ability to download the `Xenova/all-MiniLM-L6-v2` model the first time the script runs.

## Installation

1. Install [pro-commit](https://pre-commit.com) hook

   ```bash
   pre-commit install
   ```

NOTE: To be able to run `pre-commit` on all the files (whether they're part of a commit or not). Useful to run every now and then:

```bash
pre-commit run --all-files
```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create `.env.local` in the project root (same folder as `package.json`) and supply:

   ```ini
   # Chat backend
   LLAMA_MODEL=meta-llama/Meta-Llama-3-8B-Instruct
   LLAMA_API_KEY=hf_xxxxxxx            # or set HF_TOKEN
   LLM_SERVICE_URL=http://localhost:8001
   POSTGRES_URL=postgres://icharm_user:icharm_dev_password@localhost:5432/icharm_chat
   POSTGRES_URL_NON_POOLING=postgres://icharm_user:icharm_dev_password@localhost:5432/icharm_chat
   ```

   Add any other app-specific settings you need (API base URL, etc.).

4. To generate embeddings, run:
   node src/components/Scripts/embedTutorial.js
   This will train the chatbot to gain information about the icharm website

## Database (Docker)

The PostgreSQL database boots in a Linux container so every developer gets the same schema, regardless of OS.

Install Docker before attempting to run the database

1. (Optional) Override defaults before starting the container by exporting the following in your shell or a `.env` file alongside `docker-compose.yml`:
   ```ini
   ICHARM_DB_USER=icharm_user
   ICHARM_DB_PASSWORD=icharm_dev_password
   ICHARM_DB_NAME=icharm
   ICHARM_DB_PORT=5432
   ```
2. Start the database (and optional services):

   ```bash
   # Start all services in the background
   docker compose up -d

   # Stop and remove all containers
   docker compose down
   ```

   # IF YOU START TO GET API ERRORS FOR THE RASTERS, RUN:

   docker compose down -v
   docker compose build
   docker compose up -d

   ```bash

   # Generate SQL migrations based on your Drizzle schema
   # Then apply those migrations to your database
   npx drizzle-kit generate && npx drizzle-kit migrate

   # Populate the database with initial seed data
   npm run db:seed
   ```

   # If this gives an error, make sure the docker containers are running then try:

   npm run db:push
   npm run db:seed

3. Verify connectivity from Node: (run from root)

   ```bash
   npx tsx src/components/Scripts/chat-db.ts
   ```

4. Use
   docker exec -it icharm-db psql -U icharm_user -d icharm
   to go into a psql terminal.
   Once in psql terminal, run:
   \dt
   SELECT \* FROM metadata;
   to if database tables are successfully initialized and metadata is seeded

5. Update/confirm the `POSTGRES_URL` values in `.env.local` match the credentials you used in step 1. The defaults match the connection string shown above.

Use `docker compose down` to stop the database or `docker compose down -v` to reset the data directory and re-run the initialization script.

## LLM Service (FastAPI)

- The FastAPI microservice wraps Hugging Face chat completions and runs alongside Postgres via Docker Compose.
- Configure the service with `HF_TOKEN`, `LLAMA_API_KEY`, `LLAMA_MODEL`, and `LLM_SERVICE_PORT` in `.env`. The Next.js API calls it through `LLM_SERVICE_URL`.
- Start it with:
  ```bash
  docker compose -f docker/docker-compose.yml --project-directory . up -d llm-service
  ```
  or launch it together with the database and dataset API: `docker compose -f docker/docker-compose.yml --project-directory . up -d db data-api llm-service`.
- Health check endpoint: <http://localhost:8001/health>. The chat endpoint lives at `/v1/chat`.
- The Next.js backend stores conversations in Postgres as before; the FastAPI service is stateless and can reach the database container if you later need direct access (same Docker network).

## Dataset API (FastAPI)

- See [docs/iCharmFastAPI.md](docs/iCharmFastAPI.md) for internals, supported datasets, and CMORPH timeseries details.

## CMORPH Timeseries Modal

- Select the CMORPH dataset on the globe to enable the precipitation modal.
- Click on the globe to open the region info panel; press **Time Series** to fetch daily values for the chosen month.
- The modal queries `/api/cdr/precip-timeseries`, which proxies the backend `/cdr/precip_timeseries` endpoint.
- Dates are clamped to the CMORPH coverage window (see dataset metadata).
- Rebuild `data-api` after backend changes: `docker compose -f docker/docker-compose.yml --project-directory . up -d --build data-api`.

- The data API lived under `services/data-api/app/` and provides dataset metadata plus time-series endpoints consumed by the Next.js app.
- Configure `.env.local` with `DATA_SERVICE_URL` (defaults to <http://localhost:8002>) so the frontend hits the compose-exposed port.
- Start (or restart) the service with:
  ```bash
  docker compose -f docker/docker-compose.yml --project-directory . up -d data-api
  ```
- The API listens on <http://localhost:8002>. When running inside the compose network, other containers can reach it at `http://icharm-data-api:8000`.
- To run the service locally without Docker, change into `services/data-api` and execute `uvicorn app.iCharmFastAPI:app --reload`.

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
shadcn & recharts - ui components and timeseries chart visualization
Driver.js - animated tutorial tour (React Joyride dependencies not updated for React19)
pqoqubbw - animated icons
llama - open source llm for chatbot
