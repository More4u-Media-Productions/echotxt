import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ONESIGNAL_APP_ID = "4b504597-989a-4574-8bc9-aedb018005c2";

const input = z.object({
  conversationId: z.string().uuid(),
  preview: z.string().max(160),
  title: z.string().max(80),
});

const callInput = z.object({
  conversationId: z.string().uuid(),
  media: z.enum(["voice", "video"]),
  kind: z.enum(["incoming", "missed"]),
});

interface PrefRow {
  user_id: string;
  push_enabled: boolean;
  messages_enabled: boolean;
  groups_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: number;
  quiet_end: number;
  utc_offset_minutes: number;
}

function inQuietHours(pref: PrefRow): boolean {
  if (!pref.quiet_hours_enabled) return false;
  const local = new Date(Date.now() + pref.utc_offset_minutes * 60_000);
  const hour = local.getUTCHours();
  const { quiet_start: start, quiet_end: end } = pref;
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Resolves who should receive a push for a conversation event: other members
 * who accepted, have not muted the conversation, and whose notification
 * preferences allow it. Recipients are derived server-side from the caller's
 * own membership, so a client can never target arbitrary users.
 */
async function resolveRecipients(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          value: string,
        ) => {
          eq: (col: string, value: string) => { maybeSingle: () => Promise<{ data: unknown }> };
          then?: unknown;
        };
        in: (col: string, values: string[]) => Promise<{ data: PrefRow[] | null }>;
      };
    };
  },
  conversationId: string,
  userId: string,
  category: "messages" | "groups",
): Promise<string[]> {
  const client = supabase as unknown as {
    from: (table: string) => any;
  };

  const { data: mine } = await client
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!mine) return [];

  const { data: members } = await client
    .from("conversation_members")
    .select("user_id, muted, accepted")
    .eq("conversation_id", conversationId);

  const candidates: string[] = (members ?? [])
    .filter((m: { user_id: string; muted: boolean; accepted: boolean }) => {
      return m.user_id !== userId && !m.muted && m.accepted;
    })
    .map((m: { user_id: string }) => m.user_id);
  if (candidates.length === 0) return [];

  const { data: prefs } = await client
    .from("notification_prefs")
    .select(
      "user_id, push_enabled, messages_enabled, groups_enabled, quiet_hours_enabled, quiet_start, quiet_end, utc_offset_minutes",
    )
    .in("user_id", candidates);

  const byUser = new Map<string, PrefRow>((prefs ?? []).map((p: PrefRow) => [p.user_id, p]));
  return candidates.filter((id) => {
    const pref = byUser.get(id);
    if (!pref) return true; // no prefs row yet = defaults (allowed)
    if (!pref.push_enabled) return false;
    if (category === "messages" && !pref.messages_enabled) return false;
    if (category === "groups" && !pref.groups_enabled) return false;
    return !inQuietHours(pref);
  });
}

async function sendPush(opts: {
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

/**
 * Sends a web push to every other member of the conversation who has not muted
 * it. No-ops when push isn't configured.
 */
export const notifyNewMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env['ONESIGNAL_REST_API_KEY'];
    if (!apiKey) return { sent: 0, configured: false };

    const recipients = await resolveRecipients(
      context.supabase as never,
      data.conversationId,
      context.userId,
      "messages",
    );
    if (recipients.length === 0) return { sent: 0, configured: true };

    const sent = await sendPush({
      apiKey,
      recipients,
      title: data.title,
      body: data.preview,
      collapseId: `echo-${data.conversationId}`,
    });
    return { sent, configured: true };
  });

/**
 * Ringing / missed-call push. Call alerts bypass quiet hours only for the
 * "incoming" kind so a live call still reaches the device, but muted
 * conversations are always respected.
 */
export const notifyCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => callInput.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env['ONESIGNAL_REST_API_KEY'];
    if (!apiKey) return { sent: 0, configured: false };

    const { data: convo } = await context.supabase
      .from("conversations")
      .select("kind, title")
      .eq("id", data.conversationId)
      .maybeSingle();

    const recipients = await resolveRecipients(
      context.supabase as never,
      data.conversationId,
      context.userId,
      convo?.kind === "group" ? "groups" : "messages",
    );
    if (recipients.length === 0) return { sent: 0, configured: true };

    const { data: me } = await context.supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", context.userId)
      .maybeSingle();

    const caller = me?.display_name || me?.username || "Someone";
    const label = data.media === "video" ? "video call" : "voice call";
    const isGroup = convo?.kind === "group";
    const title =
      data.kind === "incoming"
        ? isGroup
          ? `${convo?.title ?? "Group"} — incoming ${label}`
          : `Incoming ${label}`
        : `Missed ${label}`;
    const body =
      data.kind === "incoming"
        ? `${caller} is calling you on Echo`
        : `You missed a ${label} from ${caller}`;

    const sent = await sendPush({
      apiKey,
      recipients,
      title,
      body,
      collapseId: `echo-call-${data.conversationId}`,
      // A ring is only useful while it's ringing.
      ttl: data.kind === "incoming" ? 45 : 3600,
    });
    return { sent, configured: true };
  });
