/**
 * Echo — central, portable Supabase client configuration.
 *
 * These two values are intentionally client-safe (the publishable key is meant
 * to be visible in the browser; all security is enforced by RLS, storage
 * policies and RPC permissions). They are hard-coded here so Echo keeps working
 * when it is exported from Lovable, cloned from GitHub, deployed to Cloudflare
 * or another host, or run locally with no .env file at all.
 *
 * Resolution order for every Supabase client in the app:
 *   1. environment variable (VITE_* in the browser, plain names on the server)
 *   2. this built-in configuration  <-- never allowed to be missing
 *
 * Set ECHO_FORCE_BUILTIN_SUPABASE to true to ignore environment variables
 * entirely and always use the built-in Echo project below.
 */

export const ECHO_SUPABASE_URL = "https://uvfunsetjwdatnynwnkw.supabase.co";
export const ECHO_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ddsb_8-_UOfIBqFOvJ8yqQ_Bg-Mur5H";
export const ECHO_SUPABASE_PROJECT_ID = "uvfunsetjwdatnynwnkw";

/** Aliases kept for compatibility with other naming conventions. */
export const ECHO_SUPABASE_ANON_KEY = ECHO_SUPABASE_PUBLISHABLE_KEY;

export const ECHO_FORCE_BUILTIN_SUPABASE = false;

type EnvBag = Record<string, string | undefined>;

function viteEnv(): EnvBag {
  try {
    return (import.meta as unknown as { env?: EnvBag }).env ?? {};
  } catch {
    return {};
  }
}

function nodeEnv(): EnvBag {
  try {
    return typeof process !== "undefined" && process.env ? (process.env as EnvBag) : {};
  } catch {
    return {};
  }
}

function firstNonEmpty(names: string[]): string | undefined {
  if (ECHO_FORCE_BUILTIN_SUPABASE) return undefined;
  const bags = [viteEnv(), nodeEnv()];
  for (const name of names) {
    for (const bag of bags) {
      const value = bag[name];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
  }
  return undefined;
}

/** Supabase URL: env if present, otherwise the built-in Echo project. */
export function resolveSupabaseUrl(): string {
  return (
    firstNonEmpty([
      "VITE_SUPABASE_URL",
      "SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "PUBLIC_SUPABASE_URL",
    ]) ?? ECHO_SUPABASE_URL
  );
}

/** Publishable (anon) key: env if present, otherwise the built-in Echo key. */
export function resolveSupabasePublishableKey(): string {
  return (
    firstNonEmpty([
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "PUBLIC_SUPABASE_ANON_KEY",
    ]) ?? ECHO_SUPABASE_PUBLISHABLE_KEY
  );
}

export function resolveSupabaseProjectId(): string {
  return (
    firstNonEmpty(["VITE_SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_ID"]) ?? ECHO_SUPABASE_PROJECT_ID
  );
}

/** Convenience object for any module that wants both values at once. */
export const echoSupabaseConfig = {
  get url() {
    return resolveSupabaseUrl();
  },
  get publishableKey() {
    return resolveSupabasePublishableKey();
  },
  get anonKey() {
    return resolveSupabasePublishableKey();
  },
  get projectId() {
    return resolveSupabaseProjectId();
  },
};
