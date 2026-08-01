ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_members REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.message_read_receipts REPLICA IDENTITY FULL;
ALTER TABLE public.friendships REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['messages','conversations','conversation_members','message_reactions','message_read_receipts','friendships','notifications'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- keep conversation ordering fresh for group activity
DROP TRIGGER IF EXISTS bump_conversation_on_message ON public.messages;
CREATE TRIGGER bump_conversation_on_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.bump_conversation();

DROP TRIGGER IF EXISTS notify_on_new_message ON public.messages;
CREATE TRIGGER notify_on_new_message
AFTER INSERT ON public.messages
FOR EACH ROW WHEN (new.kind <> 'system') EXECUTE FUNCTION public.notify_new_message();
