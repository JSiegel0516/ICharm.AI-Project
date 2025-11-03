import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import dotenv from "dotenv";

dotenv.config({
  path: ".env.local",
});

if (!process.env.POSTGRES_URL) {
  throw new Error("DATABASE_URL is not set");
}

const connectionString = process.env.POSTGRES_URL;

const queryClient = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });
