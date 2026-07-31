REVOKE EXECUTE ON FUNCTION public.is_member(uuid, uuid) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated;

-- Ensure service_role can still invoke these helpers for admin/maintenance use
GRANT EXECUTE ON FUNCTION public.is_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_conversation() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;