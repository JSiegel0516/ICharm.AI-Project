// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react"

// Create a single shared instance of the Better Auth client
export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
})

// Export session hooks and sign-out function
export const { useSession, signOut } = authClient

// Define supported social providers (extend as needed)
export type SocialProvider =
  | "github"
  | "google"

// Generic, type-safe helper for social sign-in
export const signInSocial = async (provider: SocialProvider) => {
  const data = await authClient.signIn.social({
    provider,
    callbackURL: "/dashboard",
    errorCallbackURL: "/error",
    newUserCallbackURL: "/welcome",
    disableRedirect: true,
  })

  return data
}

// Optional: if you want explicit aliases for readability
export const signInGithub = () => signInSocial("github")
export const signInGoogle = () => signInSocial("google")

