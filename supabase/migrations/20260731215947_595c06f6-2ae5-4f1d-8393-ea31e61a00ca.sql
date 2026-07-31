-- Add avatar/banner storage URLs to user profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS privacy_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add avatar/banner storage URLs to conversations (groups and DMs)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS banner_url text;

-- Add attachment metadata to messages for file/image/voice sharing
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

-- Track per-message read receipts
CREATE TABLE IF NOT EXISTS public.message_read_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_read_receipts TO authenticated;
GRANT ALL ON public.message_read_receipts TO service_role;

ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read receipts in their conversations"
  ON public.message_read_receipts
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_read_receipts.message_id
      AND public.is_member(m.conversation_id, auth.uid())
  ));

CREATE POLICY "Users can mark messages as read in their conversations"
  ON public.message_read_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_read_receipts.message_id
        AND public.is_member(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can update their own read receipts"
  ON public.message_read_receipts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own read receipts"
  ON public.message_read_receipts
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());