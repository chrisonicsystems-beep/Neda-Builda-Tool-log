BEGIN;

-- 1. Enable RLS on the users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Drop ALL existing policies on public.users to ensure no old recursive policies survive
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
  END LOOP;
END $$;

-- 3. Safely add a UNIQUE constraint to auth_uid if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE (conname = 'users_auth_uid_unique' OR conname = 'users_auth_uid_key')
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_auth_uid_unique UNIQUE (auth_uid);
  END IF;
END $$;

-- 4. Create a safe SECURITY DEFINER function to check admin status
-- This runs with elevated privileges (BYPASSRLS) so it can check the users table 
-- without triggering RLS policies again (which is what causes infinite recursion).
DROP FUNCTION IF EXISTS public.is_admin();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE auth_uid = auth.uid() AND role = 'ADMIN' AND is_enabled = true
  );
$$;

-- Ensure the function is owned by postgres to guarantee it bypasses RLS
ALTER FUNCTION public.is_admin() OWNER TO postgres;

-- 5. Create RLS Policies

-- Users can view their own enabled profile
CREATE POLICY "Users can view own profile" 
ON public.users 
FOR SELECT 
USING (auth_uid = auth.uid() AND is_enabled = true);

CREATE POLICY "Users can update own profile" 
ON public.users 
FOR UPDATE 
USING (auth_uid = auth.uid() AND is_enabled = true)
WITH CHECK (auth_uid = auth.uid() AND is_enabled = true);

CREATE POLICY "Users can insert own profile" 
ON public.users 
FOR INSERT 
WITH CHECK (auth_uid = auth.uid());

-- Admin policies using the safe function
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
