'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_projects: number | null;
  max_rams_per_month: number | null;
  max_storage_mb: number | null;
  ai_reviews: boolean;
  sort_order: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(pence: number, currency: string): string {
  if (pence === 0) return 'Free';
  const amount = pence / 100;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amount);
}

function limitLabel(value: number | null): string {
  return value === null ? 'Unlimited' : String(value);
}

function planFeatures(plan: Plan): string[] {
  const features: string[] = [];
  features.push(`${limitLabel(plan.max_projects)} project${plan.max_projects === 1 ? '' : 's'}`);
  features.push(`${limitLabel(plan.max_rams_per_month)} RAMS reviews / month`);
  features.push(`${limitLabel(plan.max_storage_mb)} MB storage`);
  if (plan.ai_reviews) features.push('Live AI text extraction + gap analysis (recommendations only)');
  if (plan.slug === 'enterprise') {
    features.push('Priority support');
    features.push('Custom SLAs');
    features.push('SSO integration');
  }
  if (plan.slug === 'pro') {
    features.push('Evidence pack PDF export');
    features.push('Email notifications');
  }
  return features;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    async function loadPlans() {
      try {
        const res = await fetch('/api/plans');
        if (res.ok) {
          const data = await res.json() as Plan[];
          setPlans(data.sort((a, b) => a.sort_order - b.sort_order));
        }
      } catch {
        // Non-fatal — show empty state
      } finally {
        setLoading(false);
      }
    }
    void loadPlans();
  }, []);

  const price = (plan: Plan) =>
    billing === 'monthly' ? plan.price_monthly : Math.round(plan.price_yearly / 12);

  return (
    <div className="container mx-auto max-w-6xl px-6 py-16">
      {/* Header */}
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Choose the plan that fits your construction compliance needs.
          All plans include a 14-day free trial.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            billing === 'monthly'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setBilling('monthly')}
        >
          Monthly
        </button>
        <button
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            billing === 'yearly'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setBilling('yearly')}
        >
          Yearly
          <span className="ml-1.5 rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">
            Save 17%
          </span>
        </button>
      </div>

      {/* Plans grid */}
      {loading ? (
        <div className="mt-12 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-b-primary" />
        </div>
      ) : plans.length === 0 ? (
        <div className="mt-12 text-center text-muted-foreground">
          Pricing plans are being configured. Check back soon.
        </div>
      ) : (
        <div className="mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-3">
          {plans.map((plan) => {
            const isPro = plan.slug === 'pro';
            const isEnterprise = plan.slug === 'enterprise';
            const features = planFeatures(plan);

            return (
              <Card
                key={plan.id}
                className={[
                  'relative flex flex-col',
                  isPro ? 'border-primary shadow-lg ring-1 ring-primary' : '',
                ].join(' ')}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      <Zap className="h-3 w-3" />
                      Most Popular
                    </span>
                  </div>
                )}

                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className="flex-1 space-y-6">
                  {/* Price */}
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">
                        {formatPrice(price(plan), plan.currency)}
                      </span>
                      {plan.price_monthly > 0 && (
                        <span className="text-sm text-muted-foreground">/ month</span>
                      )}
                    </div>
                    {billing === 'yearly' && plan.price_yearly > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatPrice(plan.price_yearly, plan.currency)} billed annually
                      </p>
                    )}
                  </div>

                  {/* Feature list */}
                  <ul className="space-y-2.5">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="pt-4">
                  {isEnterprise ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => window.location.href = 'mailto:sales@ramscompliancereview.com?subject=Enterprise%20Enquiry'}
                    >
                      Contact Sales
                    </Button>
                  ) : (
                    <Button
                      variant={isPro ? 'default' : 'outline'}
                      className="w-full"
                      onClick={() => router.push('/login?plan=' + plan.slug)}
                    >
                      {plan.price_monthly === 0 ? 'Get Started Free' : 'Start Free Trial'}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* FAQ teaser */}
      <div className="mx-auto mt-16 max-w-2xl text-center text-sm text-muted-foreground">
        <p>
          All plans include a 14-day free trial. No credit card required for the Starter plan.
          Prices shown exclude VAT. Need a custom plan?{' '}
          <a href="mailto:sales@ramscompliancereview.com" className="text-primary hover:underline">
            Get in touch
          </a>
          .
        </p>
      </div>
    </div>
  );
}
