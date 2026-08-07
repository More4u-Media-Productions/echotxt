// Client hooks for Echo's AI assistant.
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  aiAskAboutFile,
  aiPlanSearch,
  aiRewriteMessage,
  aiSummarizeConversation,
} from "./ai.functions";

export type SummaryMode = "summary" | "catchup" | "actions";
export type RewriteAction = "grammar" | "tone" | "expand" | "shorten" | "translate" | "reply";

export function useAiSummary() {
  const call = useServerFn(aiSummarizeConversation);
  return useMutation({
    mutationFn: (input: { conversationId: string; mode: SummaryMode; sinceIso?: string | null }) =>
      call({ data: input }),
  });
}

export function useAiRewrite() {
  const call = useServerFn(aiRewriteMessage);
  return useMutation({
    mutationFn: (input: {
      text: string;
      action: RewriteAction;
      tone?: string | null;
      language?: string | null;
    }) => call({ data: input }),
  });
}

export function useAiFileAnswer() {
  const call = useServerFn(aiAskAboutFile);
  return useMutation({
    mutationFn: (input: { path: string; name: string; mimeType: string; question: string }) =>
      call({ data: input }),
  });
}

export function useAiSearchPlan() {
  const call = useServerFn(aiPlanSearch);
  return useMutation({ mutationFn: (query: string) => call({ data: { query } }) });
}

export function aiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("429")) return "Echo AI is busy right now — try again in a moment.";
  if (message.includes("402")) return "AI credits are exhausted for this workspace.";
  return message || "The assistant couldn't finish that request.";
}
