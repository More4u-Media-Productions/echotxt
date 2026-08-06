import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const messageInput = z.object({
  conversationId: z.string().uuid(),
  preview: z.string().max(160),
  title: z.string().max(80),
});

const callInput = z.object({
  conversationId: z.string().uuid(),
  media: z.enum(["voice", "video"]),
  kind: z.enum(["incoming", "missed"]),
});

/**
 * Sends a web push to every other member of the conversation who has not muted
 * it and whose notification preferences allow it. No-ops when push isn't
 * configured.
 */
export const notifyNewMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => messageInput.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env['ONESIGNAL_REST_API_KEY'];
    if (!apiKey) return { sent: 0, configured: false };

    const { resolveRecipients, sendPush } = await import("@/lib/push.server");
    const recipients = await resolveRecipients(
      context.supabase,
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

/** Ringing / missed-call push for a conversation's other members. */
export const notifyCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => callInput.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env['ONESIGNAL_REST_API_KEY'];
    if (!apiKey) return { sent: 0, configured: false };

    const { resolveRecipients, sendPush } = await import("@/lib/push.server");

    const { data: convo } = await context.supabase
      .from("conversations")
      .select("kind, title")
      .eq("id", data.conversationId)
      .maybeSingle();

    const recipients = await resolveRecipients(
      context.supabase,
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
      // A ring is only useful while it is still ringing.
      ttl: data.kind === "incoming" ? 45 : 3600,
    });
    return { sent, configured: true };
  });
