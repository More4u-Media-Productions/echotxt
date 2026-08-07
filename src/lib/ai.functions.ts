// Echo AI assistant server functions. Thin wrappers only — every helper lives
// in ai.server.ts so route splitting keeps working.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  fetchAsDataUrl,
  loadTranscript,
  planSearch,
  renderTranscript,
  resolveSenderId,
  runPrompt,
  signAttachment,
} from "./ai.server";

export const aiSummarizeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        mode: z.enum(["summary", "catchup", "actions"]),
        sinceIso: z.string().nullable().optional(),
        limit: z.number().int().min(10).max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { title, lines } = await loadTranscript(
      context.supabase as never,
      data.conversationId,
      data.limit ?? 120,
      data.mode === "catchup" ? (data.sinceIso ?? null) : null,
    );
    if (lines.length === 0) {
      return { text: "There's nothing new to summarise in this conversation yet." };
    }
    const instruction =
      data.mode === "catchup"
        ? "Catch the user up on what they missed. Lead with a one-line headline, then 3-6 short bullets of what happened and anything addressed to them."
        : data.mode === "actions"
          ? "Extract concrete action items, decisions and open questions as short bullets, each prefixed with the responsible person when it is clear."
          : "Summarise the discussion. Start with a two-sentence overview, then 3-6 bullets covering the main topics and outcomes.";
    const text = await runPrompt({
      system:
        "You are Echo's assistant, embedded in a private messenger. Be concise, factual and neutral. Use plain markdown. Never invent messages or people. Refer to participants by the names in the transcript.",
      messages: [
        {
          role: "user",
          content: `${instruction}\n\nConversation: ${title}\n\nTranscript:\n${renderTranscript(lines)}`,
        },
      ],
    });
    return { text, messageCount: lines.length };
  });

export const aiRewriteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().min(1).max(4000),
        action: z.enum(["grammar", "tone", "expand", "shorten", "translate", "reply"]),
        tone: z.string().max(40).nullable().optional(),
        language: z.string().max(40).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const instruction =
      data.action === "grammar"
        ? "Fix spelling, grammar and punctuation. Keep the meaning, voice and length."
        : data.action === "tone"
          ? `Rewrite the message so it sounds ${data.tone || "friendly"}. Keep the meaning and roughly the length.`
          : data.action === "expand"
            ? "Expand the message with a little more detail and clarity, staying natural for a chat app."
            : data.action === "shorten"
              ? "Make the message shorter and punchier without losing the point."
              : data.action === "translate"
                ? `Translate the message into ${data.language || "English"}. Keep tone and formatting.`
                : "Suggest a natural reply to this message, in the same language.";
    const text = await runPrompt({
      system:
        "You rewrite chat messages. Reply with ONLY the resulting message text — no quotes, no preamble, no explanation, no markdown fences.",
      messages: [{ role: "user", content: `${instruction}\n\nMessage:\n${data.text}` }],
    });
    return { text: text.trim() };
  });

export const aiAskAboutFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        path: z.string().min(1),
        name: z.string().min(1),
        mimeType: z.string().min(1),
        question: z.string().min(1).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const url = await signAttachment(context.supabase as never, data.path);
    const isImage = data.mimeType.toLowerCase().startsWith("image/");
    const content = isImage
      ? [
          { type: "text" as const, text: data.question },
          { type: "image" as const, image: new URL(url) },
        ]
      : [
          { type: "text" as const, text: data.question },
          {
            type: "file" as const,
            data: await fetchAsDataUrl(url, data.mimeType),
            mediaType: data.mimeType,
            filename: data.name,
          },
        ];
    const text = await runPrompt({
      system:
        "You answer questions about files shared in a private messenger. Be accurate and concise, quote specifics from the file, and say plainly when the file does not contain the answer.",
      messages: [{ role: "user", content }],
    });
    return { text };
  });

export const aiPlanSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().min(2).max(300) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const plan = await planSearch(data.query);
    const senderId = await resolveSenderId(context.supabase as never, plan.sender);
    const from = plan.days
      ? new Date(Date.now() - plan.days * 24 * 60 * 60 * 1000).toISOString()
      : null;
    return { ...plan, senderId, from };
  });
