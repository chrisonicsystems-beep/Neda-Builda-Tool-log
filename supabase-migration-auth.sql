BEGIN;

-- 1. Enable RLS on the users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Clean up any existing policies to prevent conflicts
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

-- Notice regarding auth_uid NOT NULL:
-- We are keeping auth_uid nullable for this migration to avoid locking out 
-- existing legacy users who haven't migrated their passwords to Supabase Auth yet.
-- If you want to enforce NOT NULL later, verify all users have an auth_uid and run:
-- ALTER TABLE public.users ALTER COLUMN auth_uid SET NOT NULL;

-- 4. Create RLS Policies

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
-- We use a SECURITY DEFINER function to bypass RLS and avoid infinite recursion
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
