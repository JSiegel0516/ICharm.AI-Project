import { createAuthClient } from "better-auth/react"
export const authClient = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    baseURL: "http://localhost:3000"
})
export const signIn = async () => {
  const data = await authClient.signIn.social({
    provider: "github, google"
  });
  return data;
};

export const { useSession, signOut } = createAuthClient({
  baseURL: "http://localhost:3000", // your Better Auth API route
})