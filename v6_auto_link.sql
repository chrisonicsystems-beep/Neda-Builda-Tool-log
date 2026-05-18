CREATE OR REPLACE FUNCTION public.auto_link_verified_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users;
BEGIN
  -- Find the legacy user by matching auth.jwt() email
  SELECT * INTO v_user
  FROM public.users
  WHERE lower(email) = lower(auth.jwt()->>'email') 
    AND auth_uid IS NULL
    AND is_enabled = true
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.users 
    SET auth_uid = auth.uid()
    WHERE id = v_user.id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
