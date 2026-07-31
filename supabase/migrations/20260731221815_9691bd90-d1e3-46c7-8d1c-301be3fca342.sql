REVOKE EXECUTE ON FUNCTION public.is_member(uuid, uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_blocked_with(uuid) FROM authenticated, anon, PUBLIC;