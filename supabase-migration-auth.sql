BEGIN;

-- 1. Enable RLS on the users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Clean up any existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;
DROP POLICY IF EXISTS "Admins can insert all users" ON public.users;
DROP POLICY IF EXISTS "Admins can delete all users" ON public.users;

-- 3. Safely add a UNIQUE constraint to auth_uid if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'users_auth_uid_key'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_auth_uid_key UNIQUE (auth_uid);
  END IF;
END $$;

-- 4. Create the bypassing function properly with an anti-recursion guard
DROP FUNCTION IF EXISTS public.is_admin();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  is_adm boolean;
BEGIN
  -- 1) Prevent infinite recursion by checking our custom session variable
  IF current_setting('app.is_admin_check', true) = 'true' THEN
    RETURN false;
  END IF;

  -- 2) Set the variable so inner queries know we are already checking
  PERFORM set_config('app.is_admin_check', 'true', true);

  -- 3) Check if the user is an admin
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE auth_uid = auth.uid() AND role = 'ADMIN' AND is_enabled = true
  ) INTO is_adm;

  -- 4) Clear the variable
  PERFORM set_config('app.is_admin_check', 'false', true);

  RETURN COALESCE(is_adm, false);
EXCEPTION
  WHEN OTHERS THEN
    -- Ensure we clear the variable even if a completely unexpected error occurs
    PERFORM set_config('app.is_admin_check', 'false', true);
    RAISE;
END;
$$;

-- Ensure the function is owned by postgres to guarantee highest privileges
ALTER FUNCTION public.is_admin() OWNER TO postgres;

-- 5. Create RLS Policies

-- Users can view their own enabled profile
CREATE POLICY "Users can view own profile" 
ON public.users 
FOR SELECT 
USING (auth_uid = auth.uid() AND is_enabled = true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" 
ON public.users 
FOR UPDATE 
USING (auth_uid = auth.uid() AND is_enabled = true)
WITH CHECK (auth_uid = auth.uid() AND is_enabled = true);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" 
ON public.users 
FOR INSERT 
WITH CHECK (auth_uid = auth.uid());

-- Admins can do everything
CREATE POLICY "Admins can view all users" 
ON public.users 
FOR SELECT 
USING (public.is_admin());

CREATE POLICY "Admins can insert all users" 
ON public.users 
FOR INSERT 
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update all users" 
ON public.users 
FOR UPDATE 
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete all users" 
ON public.users 
FOR DELETE 
USING (public.is_admin());

COMMIT;
