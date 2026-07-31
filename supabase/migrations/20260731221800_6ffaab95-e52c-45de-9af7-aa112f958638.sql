GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_read_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.friendships TO service_role;
GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.conversation_members TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.message_reactions TO service_role;
GRANT ALL ON public.message_read_receipts TO service_role;
GRANT ALL ON public.calls TO service_role;
GRANT ALL ON public.notifications TO service_role;

GRANT EXECUTE ON FUNCTION public.search_profiles(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.friendship_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_with(uuid) TO authenticated;