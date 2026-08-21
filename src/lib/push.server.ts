// Server-only push helpers for OneSignal. Imported by src/lib/push.functions.ts
// inside handlers only — never reachable from client bundles.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { ONESIGNAL_APP_ID } from "@/config/onesignal";

export interface PrefRow {
  user_id: string;
  push_enabled: boolean;
  messages_enabled: boolean;
  groups_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: number;
  quiet_end: number;
  utc_offset_minutes: number;
}

export function inQuietHours(pref: PrefRow): boolean {
  if (!pref.quiet_hours_enabled) return false;
  const local = new Date(Date.now() + pref.utc_offset_minutes * 60_000);
  const hour = local.getUTCHours();
  const start = pref.quiet_start;
  const end = pref.quiet_end;
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Resolves who should receive a push for a conversation event: other members
 * who accepted the conversation, have not muted it, and whose notification
 * preferences allow this category outside quiet hours. Recipients are derived
 * from the caller's own membership, so a client cannot target arbitrary users.
 */
export async function resolveRecipients(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  userId: string,
  category: "messages" | "groups",
): Promise<string[]> {
  const { data: mine } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!mine) return [];

  const { data: members } = await supabase
    .from("conversation_members")
    .select("user_id, muted, accepted")
    .eq("conversation_id", conversationId);

  const candidates = (members ?? [])
    .filter((m) => m.user_id !== userId && !m.muted && m.accepted)
    .map((m) => m.user_id);
  if (candidates.length === 0) return [];

  const { data: prefs } = await supabase
    .from("notification_prefs")
    .select(
      "user_id, push_enabled, messages_enabled, groups_enabled, quiet_hours_enabled, quiet_start, quiet_end, utc_offset_minutes",
    )
    .in("user_id", candidates);

  const byUser = new Map((prefs ?? []).map((p) => [p.user_id, p as PrefRow]));
  return candidates.filter((id) => {
    const pref = byUser.get(id);
    if (!pref) return true; // no prefs row yet == defaults, which allow push
    if (!pref.push_enabled) return false;
    if (category === "messages" && !pref.messages_enabled) return false;
    if (category === "groups" && !pref.groups_enabled) return false;
    return !inQuietHours(pref);
  });
}

export async function sendPush(opts: {
  apiKey: string;
  recipients: string[];
  title: string;
  body: string;
  collapseId: string;
  ttl?: number;
}): Promise<number> {
  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Key ${opts.apiKey}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      target_channel: "push",
      include_aliases: { external_id: opts.recipients },
      headings: { en: opts.title },
      contents: { en: opts.body },
      url: "/",
      priority: 10,
      ...(opts.ttl ? { ttl: opts.ttl } : {}),
      // One collapse id per topic prevents duplicate stacked alerts.
      web_push_topic: opts.collapseId,
      collapse_id: opts.collapseId,
    }),
  });

  if (!response.ok) {
    console.error("[push] OneSignal error", response.status, await response.text());
    return 0;
  }
  return opts.recipients.length;
}
