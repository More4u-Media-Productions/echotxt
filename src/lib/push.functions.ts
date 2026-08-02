import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ONESIGNAL_APP_ID = "4b504597-989a-4574-8bc9-aedb018005c2";

const input = z.object({
  conversationId: z.string().uuid(),
  preview: z.string().max(160),
  title: z.string().max(80),
});

/**
 * Sends a web push to every other member of the conversation who has not muted
 * it. Recipients are resolved server-side from the caller's own membership, so
 * a client cannot target arbitrary users. No-ops when push isn't configured.
 */
export const notifyNewMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env['ONESIGNAL_REST_API_KEY'];
    if (!apiKey) return { sent: 0, configured: false };

    const { data: mine } = await context.supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mine) return { sent: 0, configured: true };

    const { data: members } = await context.supabase
      .from("conversation_members")
      .select("user_id, muted, accepted")
      .eq("conversation_id", data.conversationId);

    const recipients = (members ?? [])
      .filter((m) => m.user_id !== context.userId && !m.muted && m.accepted)
      .map((m) => m.user_id);
    if (recipients.length === 0) return { sent: 0, configured: true };

    const response = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        target_channel: "push",
        include_aliases: { external_id: recipients },
        headings: { en: data.title },
        contents: { en: data.preview },
        url: "/",
        // One collapse id per conversation prevents duplicate stacked alerts.
        web_push_topic: `echo-${data.conversationId}`,
        collapse_id: `echo-${data.conversationId}`,
      }),
    });

    if (!response.ok) {
      console.error("[push] OneSignal error", response.status, await response.text());
      return { sent: 0, configured: true };
    }
    return { sent: recipients.length, configured: true };
  });
