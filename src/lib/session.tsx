import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { initialsOf, type EchoProfile, type Presence, type Visibility } from "@/lib/echo-data";

const SESSION_LOAD_TIMEOUT_MS = 10_000;

interface SessionState {
  session: Session | null;
  loading: boolean;
  error: Error | null;
  online: boolean;
  retry: () => void;
}

const SessionContext = createContext<SessionState>({
  session: null,
  loading: true,
  error: null,
  online: true,
  retry: () => {},
});

function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const queryClient = useQueryClient();
  const online = useOnlineStatus();

  useEffect(() => {
    setLoading(true);
    setError(null);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const init = async () => {
      try {
        // Guard against a hanging session probe. Supabase client creation can also throw
        // if environment variables are missing, so wrap the whole flow.
        const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
          if (cancelled) return;
          setSession(next);
          setLoading(false);
          setError(null);
          if (timeoutId) clearTimeout(timeoutId);
          queryClient.invalidateQueries();
        });

        timeoutId = setTimeout(() => {
          if (cancelled) return;
          setLoading(false);
          setError(
            new Error(
              online
                ? "Echo couldn't connect to your account. Please try again."
                : "You appear to be offline. Check your connection and try again.",
            ),
          );
        }, SESSION_LOAD_TIMEOUT_MS);

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (cancelled) return;
        if (sessionError) throw sessionError;
        setSession(data.session);
        setLoading(false);
        setError(null);
        if (timeoutId) clearTimeout(timeoutId);
      } catch (err) {
        if (cancelled) return;
        console.error("[Echo] Session initialization failed:", err);
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [attempt, online, queryClient]);

  const retry = () => setAttempt((a) => a + 1);

  return (
    <SessionContext value={{ session, loading, error, online, retry }}>
      {children}
    </SessionContext>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

export function useUserId() {
  return useSession().session?.user.id ?? null;
}

export interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  pronouns: string | null;
  avatar_color: string;
  avatar_url: string | null;
  banner_url: string | null;
  presence: Presence;
  last_seen: string;
  created_at: string;
  status_text?: string | null;
  status_emoji?: string | null;
  appear_offline?: boolean | null;
  presence_visibility?: string | null;
  last_seen_visibility?: string | null;
}

function visibility(value: unknown): Visibility {
  return value === "friends" || value === "nobody" ? value : "everyone";
}

export function toProfile(row: ProfileRow): EchoProfile {
  const displayName = row.display_name || row.username;
  return {
    id: row.id,
    username: `@${row.username}`,
    displayName,
    bio: row.bio,
    pronouns: row.pronouns,
    color: row.avatar_color,
    avatar: initialsOf(displayName),
    avatarUrl: row.avatar_url ?? null,
    bannerUrl: row.banner_url ?? null,
    presence: row.presence,
    lastSeen: row.last_seen,
    joined: row.created_at,
    statusText: row.status_text ?? "",
    statusEmoji: row.status_emoji ?? null,
    appearOffline: row.appear_offline ?? false,
    presenceVisibility: visibility(row.presence_visibility),
    lastSeenVisibility: visibility(row.last_seen_visibility),
  };
}


function slugify(value: string): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9_.]/g, "");
  return (clean.length >= 3 ? clean : `${clean}user`).slice(0, 20);
}

/** Creates the profile row for a signed-in user when one doesn't exist yet. */
export async function ensureProfile(session: Session): Promise<void> {
  const meta = (session.user.user_metadata ?? {}) as Record<string, string | undefined>;
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (existing) return;

  const base = slugify(
    meta['username'] || session.user.email?.split("@")[0] || `echo${Date.now() % 100000}`,
  );
  const displayName = meta['display_name'] || meta['full_name'] || base;
  const hue = Math.floor(Math.random() * 360);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = attempt === 0 ? base : `${base.slice(0, 18)}${attempt}`;
    const { error } = await supabase.from("profiles").insert({
      id: session.user.id,
      username,
      display_name: displayName,
      avatar_color: `oklch(0.63 0.13 ${hue})`,
      avatar_url: meta['avatar_url'] ?? null,
    });
    if (!error) return;
    if (error.code !== "23505") throw error;
  }
}

export function useMyProfile() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<EchoProfile | null> => {
      if (session) await ensureProfile(session);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data ? toProfile(data as ProfileRow) : null;
    },
    retry: 1,
  });
}


export async function signOutEverywhere() {
  await supabase.auth.signOut();
}
