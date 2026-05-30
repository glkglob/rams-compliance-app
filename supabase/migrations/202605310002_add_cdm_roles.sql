-- Add CDM 2015 dutyholder roles to the user_role enum.
--
-- The Construction Design and Management Regulations 2015 (CDM 2015) define
-- five duty holder types that map directly to user roles in this application.
-- All five are added here as first-class enum values so profile rows, project
-- memberships, and RLS policies can express them precisely.
--
-- Existing roles (admin, project_manager, reviewer, viewer, user) are
-- unchanged; they coexist in the enum for backward compatibility.

DO $$
BEGIN
  -- client: the organisation or individual who commissions the construction work
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'client'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'client';
  END IF;

  -- principal_designer: coordinates health and safety in the pre-construction phase
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'principal_designer'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'principal_designer';
  END IF;

  -- principal_contractor: plans, manages, monitors and coordinates the construction phase
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'principal_contractor'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'principal_contractor';
  END IF;

  -- designer: contributes to the structural or architectural design of the project
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'designer'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'designer';
  END IF;

  -- contractor: carries out the construction work and submits RAMS
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'contractor'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'contractor';
  END IF;
END $$;
