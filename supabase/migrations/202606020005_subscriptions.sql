-- ── Subscription schema ───────────────────────────────────────────────────────
--
-- Stores pricing plans and per-organisation subscriptions. Designed to be
-- wired to Stripe later (stripe_price_id, stripe_subscription_id, etc.).
-- For now the table is populated manually or via seed; checkout/webhook
-- integration will be added in a future migration.

SET search_path TO public, extensions;

-- ── 1. Subscription status enum ────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE public.subscription_status AS ENUM (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'incomplete'
    );
  END IF;
END $$;

-- ── 2. Plans table ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plans (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT    NOT NULL UNIQUE,
  slug             TEXT    NOT NULL UNIQUE,
  description      TEXT,
  price_monthly    INTEGER NOT NULL DEFAULT 0,  -- pence (GBP) or cents
  price_yearly     INTEGER NOT NULL DEFAULT 0,
  currency         TEXT    NOT NULL DEFAULT 'gbp',
  -- Feature limits
  max_projects     INTEGER,  -- NULL = unlimited
  max_rams_per_month INTEGER,
  max_storage_mb   INTEGER,
  ai_reviews       BOOLEAN NOT NULL DEFAULT false,
  -- Stripe integration (filled in later)
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly  TEXT,
  -- Ordering / visibility
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plans IS
  'Pricing plans displayed on the /pricing page and used for subscription enforcement.';

-- ── 3. Subscriptions table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner: either a profile (individual) or could extend to orgs later.
  profile_id              UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                 UUID    NOT NULL REFERENCES public.plans(id),
  status                  public.subscription_status NOT NULL DEFAULT 'trialing',
  -- Billing period
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
  canceled_at             TIMESTAMPTZ,
  -- Stripe integration (filled in later)
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT UNIQUE,
  -- Timestamps
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_profile
  ON public.subscriptions (profile_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ── 4. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Plans: anyone can read active plans (public pricing page)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'plans' AND policyname = 'Anyone can view active plans'
  ) THEN
    CREATE POLICY "Anyone can view active plans"
      ON public.plans FOR SELECT
      USING (is_active = true);
  END IF;
END $$;

-- Subscriptions: users can only see their own
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Users can view own subscriptions'
  ) THEN
    CREATE POLICY "Users can view own subscriptions"
      ON public.subscriptions FOR SELECT TO authenticated
      USING (profile_id = auth.uid());
  END IF;
END $$;

-- Writes go through service-role (checkout/webhook handlers)

-- ── 5. Seed default plans ──────────────────────────────────────────────────────

INSERT INTO public.plans (name, slug, description, price_monthly, price_yearly, currency, max_projects, max_rams_per_month, max_storage_mb, ai_reviews, sort_order)
VALUES
  ('Starter',    'starter',    'For small contractors getting started with compliance.', 0,     0,     'gbp', 2,    10,   500,   false, 1),
  ('Professional', 'pro',     'For growing firms that need AI-powered reviews.',       4900,  49000, 'gbp', 10,   100,  5000,  true,  2),
  ('Enterprise', 'enterprise', 'Unlimited projects, priority support, and custom SLAs.', 14900, 149000, 'gbp', NULL, NULL, NULL,  true,  3)
ON CONFLICT (slug) DO NOTHING;

-- ── 6. updated_at trigger ──────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS handle_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER handle_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
