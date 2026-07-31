import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { initialsOf, type EchoProfile, type Presence } from "@/lib/echo-data";

const SessionContext = createContext<{ session: Session | null; loading: boolean }>({
  session: null,
  loading: true,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
      queryClient.invalidateQueries();
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return <SessionContext value={{ session, loading }}>{children}</SessionContext>;
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
  presence: Presence;
  last_seen: string;
  created_at: string;
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
    presence: row.presence,
    lastSeen: row.last_seen,
    joined: row.created_at,
  };
}

export function useMyProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<EchoProfile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data ? toProfile(data as ProfileRow) : null;
    },
  });
}

export async function signOutEverywhere() {
  await supabase.auth.signOut();
}
