import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { cache } from "react";
import { headers } from "next/headers";
import { db } from "@/lib/db/index"; // your drizzle instance

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [nextCookies()],
  socialProviders: {
    google: {
      prompt: "select_account consent",
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      accessType: "offline",
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
});

export const getSession = cache(async () => {
  return await auth.api.getSession({
    headers: await headers(),
  });
});
