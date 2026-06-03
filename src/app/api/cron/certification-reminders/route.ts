import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { sendEmail } from '@/lib/email/resend';
import { logger } from '@/lib/logging';
import { withRequestContext } from '@/lib/request-context';

/**
 * POST /api/cron/certification-reminders
 *
 * Daily cron: finds certifications expiring within 30/14/7 days and sends
 * a reminder email to the owner. Each reminder tier is sent once — tracked
 * via the reminder_*_sent boolean columns.
 *
 * Auth: CRON_SECRET bearer token or QStash signature.
 */

interface CertRow {
  id: string;
  name: string;
  expiry_date: string;
  issuing_body: string | null;
  reminder_30d_sent: boolean;
  reminder_14d_sent: boolean;
  reminder_7d_sent: boolean;
  profiles: { email: string | null; full_name: string | null } | null;
}

const TIERS = [
  { days: 30, column: 'reminder_30d_sent' as const, label: '30 days' },
  { days: 14, column: 'reminder_14d_sent' as const, label: '14 days' },
  { days: 7,  column: 'reminder_7d_sent'  as const, label: '7 days'  },
] as const;

async function postCertificationReminders(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const today = new Date();
  let emailsSent = 0;
  let errors = 0;

  for (const tier of TIERS) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + tier.days);
    const targetStr = targetDate.toISOString().slice(0, 10); // YYYY-MM-DD

    // Find certs expiring on exactly this target date where the reminder hasn't been sent
    const { data: certs, error: queryError } = await admin
      .from('certifications')
      .select('id, name, expiry_date, issuing_body, reminder_30d_sent, reminder_14d_sent, reminder_7d_sent, profiles:profile_id (email, full_name)')
      .eq('expiry_date', targetStr)
      .eq(tier.column, false);

    if (queryError) {
      logger.error('Cert reminder query failed', { tier: tier.label, error: queryError.message });
      errors++;
      continue;
    }

    if (!certs?.length) continue;

    for (const rawCert of certs as unknown as CertRow[]) {
      // Supabase FK joins may return an array or a single object depending on
      // the relation cardinality. Normalise to a single object.
      const profileData = Array.isArray(rawCert.profiles) ? rawCert.profiles[0] : rawCert.profiles;
      const email = profileData?.email;
      if (!email) continue;

      const cert = rawCert;
      const name = profileData?.full_name ?? 'there';
      const subject = `Certification expiring in ${tier.label}: ${cert.name}`;
      const body = [
        `Hi ${name},`,
        '',
        `Your certification "${cert.name}"${cert.issuing_body ? ` issued by ${cert.issuing_body}` : ''} is expiring on ${cert.expiry_date}.`,
        '',
        `That's ${tier.label} from now. Please arrange renewal before it expires to maintain compliance on your projects.`,
        '',
        'You can view your certifications in Organisation settings.',
        '',
        'Regards,',
        'RAMS Compliance Review',
      ].join('\n');

      const result = await sendEmail(email, subject, body);

      if (result.success) {
        // Mark this reminder tier as sent
        await admin
          .from('certifications')
          .update({ [tier.column]: true })
          .eq('id', cert.id);

        emailsSent++;
      } else {
        logger.warn('Cert reminder email failed', {
          certId: cert.id,
          tier: tier.label,
          error: result.error,
        });
        errors++;
      }
    }
  }

  logger.info('Certification reminder cron complete', { emailsSent, errors });

  return NextResponse.json({ success: true, emailsSent, errors });
}

export const POST = withRequestContext(postCertificationReminders, '/api/cron/certification-reminders');
