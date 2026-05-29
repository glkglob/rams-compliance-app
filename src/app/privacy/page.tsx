import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: 'Privacy Policy | RAMS Compliance Review',
  description: 'How we collect, use, and protect your personal data in the RAMS Compliance Review system.',
};

export default function PrivacyPolicyPage() {
  const lastUpdated = '25 May 2025';

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to home
            </Link>
          </Button>

          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
          </div>
          <p className="mt-2 text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-semibold">1. Who we are</h2>
            <p>
              RAMS Compliance Review (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is a tool that helps construction project teams
              manage and review Risk Assessment and Method Statement (RAMS) documents for compliance with
              UK health and safety law.
            </p>
            <p>
              For the purposes of the UK General Data Protection Regulation (UK GDPR) and the Data
              Protection Act 2018, the data controller is the organisation that has licensed or deployed
              this instance of the service. If you are unsure who the controller is for your account,
              please contact the project administrator or the email address shown in your account welcome email.
            </p>
          </section>

          {/* Data we collect */}
          <section>
            <h2 className="text-2xl font-semibold">2. What personal data we collect</h2>
            <p>We collect and process the following categories of personal data:</p>

            <div className="mt-4 space-y-4">
              <div>
                <h3 className="font-semibold">Account and identity data</h3>
                <ul className="list-disc pl-6">
                  <li>Name, email address, and role (admin, project manager, reviewer, viewer)</li>
                  <li>Authentication data via Supabase Auth</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold">Project and organisational data</h3>
                <ul className="list-disc pl-6">
                  <li>Project names, client names, site addresses, and descriptions</li>
                  <li>Project membership and role assignments</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold">Uploaded documents and RAMS content</h3>
                <ul className="list-disc pl-6">
                  <li>Compliance documents (policies, health &amp; safety files, site rules, client requirements)</li>
                  <li>RAMS submissions including subcontractor names, trade packages, email addresses, and the full document content</li>
                  <li>
                    These documents may contain personal data of workers, site personnel, or third parties
                    (names, contact details, competency records, health information in COSHH or method statements).
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold">AI processing data</h3>
                <p>
                  Document text and RAMS content are sent to OpenAI for analysis to extract requirements
                  and perform compliance comparisons. We have a Data Processing Agreement in place with OpenAI.
                </p>
              </div>

              <div>
                <h3 className="font-semibold">Technical and audit data</h3>
                <ul className="list-disc pl-6">
                  <li>IP addresses, browser type, and timestamps (via standard web server logs)</li>
                  <li>Complete audit trail of actions performed within the system (who did what and when)</li>
                  <li>Compliance review decisions, scores, and generated email content</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Legal bases */}
          <section>
            <h2 className="text-2xl font-semibold">3. Legal bases for processing</h2>
            <p>We rely on the following lawful bases under Article 6 of the UK GDPR:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Contract performance</strong> — to provide the RAMS review service you or your
                organisation have requested.
              </li>
              <li>
                <strong>Legitimate interests</strong> — to operate, secure, and improve the service,
                prevent fraud, and maintain audit records.
              </li>
              <li>
                <strong>Legal obligation</strong> — health and safety records (including RAMS) are often
                required to be retained under the Health and Safety at Work etc. Act 1974, the Construction
                (Design and Management) Regulations 2015 (CDM 2015), and for insurance and regulatory purposes.
              </li>
              <li>
                <strong>Consent</strong> — where you have explicitly agreed (e.g. marketing communications,
                if any).
              </li>
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Some documents may contain special category data (e.g. health information). Where this occurs,
              we rely on substantial public interest (Schedule 1, Part 2, DPA 2018) and explicit consent
              obtained by the project controller at the point of document collection.
            </p>
          </section>

          {/* How we use data */}
          <section>
            <h2 className="text-2xl font-semibold">4. How we use your data</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To authenticate users and manage access control</li>
              <li>To enable project collaboration and role-based permissions</li>
              <li>To extract compliance requirements and automatically review RAMS documents using AI</li>
              <li>To generate review decisions, explanations, and draft emails to subcontractors</li>
              <li>To maintain a tamper-evident audit log for regulatory and dispute purposes</li>
              <li>To improve the accuracy and safety of the compliance review system</li>
            </ul>
          </section>

          {/* Data sharing */}
          <section>
            <h2 className="text-2xl font-semibold">5. Who we share data with</h2>
            <p>We use the following sub-processors:</p>
            <ul className="list-disc pl-6">
              <li>
                <strong>Supabase</strong> (hosting, database, authentication, and file storage) — based in the
                United States with appropriate safeguards.
              </li>
              <li>
                <strong>OpenAI</strong> (AI analysis of documents) — data is processed in the United States.
                We have a Data Processing Agreement and Standard Contractual Clauses in place.
              </li>
              <li>
                <strong>Resend</strong> (transactional email delivery) — for sending compliance review emails
                when requested by reviewers.
              </li>
            </ul>
            <p className="mt-4">
              We will never sell your personal data. We may disclose data if required by law or to protect
              the vital interests of individuals on construction sites.
            </p>
          </section>

          {/* International transfers */}
          <section>
            <h2 className="text-2xl font-semibold">6. International transfers</h2>
            <p>
              Some of our processors (OpenAI, Supabase) are based in the United States. We ensure appropriate
              safeguards are in place, including Standard Contractual Clauses approved by the UK Government
              and, where applicable, the UK Addendum to the SCCs.
            </p>
          </section>

          {/* Retention */}
          <section>
            <h2 className="text-2xl font-semibold">7. How long we keep your data</h2>
            <div className="space-y-3">
              <p>
                <strong>Account data</strong> (profile, memberships): Deleted within 30 days of a verified
                account deletion request, subject to the exceptions below.
              </p>
              <p>
                <strong>Project, compliance documents, and RAMS data</strong>: Retained for a minimum of{' '}
                <strong>6 years</strong> from the date of project completion or last material activity. This
                period may be extended where required by:
              </p>
              <ul className="list-disc pl-6">
                <li>CDM 2015 health and safety file requirements</li>
                <li>Statutory limitation periods for personal injury claims (often 3–6 years, sometimes longer)</li>
                <li>Insurance policy requirements</li>
                <li>Regulatory investigations or enforcement action</li>
              </ul>
              <p>
                <strong>Audit logs</strong>: Retained for 6 years to support regulatory compliance and
                incident investigation.
              </p>
              <p className="text-sm text-muted-foreground">
                When you request deletion of your account, we will remove your personal identifiers from
                retained project records where it is technically feasible and does not conflict with legal
                obligations (data minimisation / pseudonymisation).
              </p>
            </div>
          </section>

          {/* Your rights */}
          <section>
            <h2 className="text-2xl font-semibold">8. Your rights under UK GDPR</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access the personal data we hold about you (Subject Access Request)</li>
              <li>Rectify inaccurate or incomplete data</li>
              <li>Erase your personal data (&quot;right to be forgotten&quot;) — subject to legal retention obligations</li>
              <li>Restrict processing in certain circumstances</li>
              <li>Data portability (where processing is based on consent or contract)</li>
              <li>Object to processing based on legitimate interests</li>
              <li>Not be subject to solely automated decisions that produce legal or significant effects</li>
            </ul>

            <div className="mt-6 rounded-lg border bg-muted/50 p-4">
              <p className="font-medium">Important limitation on erasure</p>
              <p className="mt-2 text-sm">
                Because this system is used to create and store health and safety records required by UK law,
                we may be unable to delete project-level documents, RAMS submissions, review decisions, and
                audit logs even after you delete your account. These records belong to the project controller
                (usually your employer or the principal contractor) and are retained for legal and safety reasons.
              </p>
            </div>

            <p className="mt-4">
              To exercise any of these rights, email the address provided in your onboarding materials or use
              the in-app account deletion tool. We aim to respond within one month.
            </p>
          </section>

          {/* Automated decision making */}
          <section>
            <h2 className="text-2xl font-semibold">9. Automated decision-making and AI</h2>
            <p>
              The system uses AI (large language models) to analyse documents and suggest compliance decisions.
              These are <strong>recommendations only</strong>. Final decisions are made or confirmed by human
              reviewers with appropriate competence. You have the right to request human review of any
              automated output that affects you.
            </p>
          </section>

          {/* Security */}
          <section>
            <h2 className="text-2xl font-semibold">10. Security</h2>
            <p>
              We use industry-standard technical and organisational measures including encryption in transit
              and at rest, role-based access control, row-level security in the database, and comprehensive
              audit logging. No system is 100% secure; if you believe your account has been compromised,
              contact us immediately.
            </p>
          </section>

          {/* ICO */}
          <section>
            <h2 className="text-2xl font-semibold">11. Contacting the ICO</h2>
            <p>
              If you are unhappy with how we have handled your personal data, you have the right to complain
              to the UK Information Commissioner&rsquo;s Office (ICO):
            </p>
            <div className="mt-3 rounded-md border p-4 text-sm">
              <p>
                <strong>Information Commissioner&rsquo;s Office</strong><br />
                Wycliffe House, Water Lane<br />
                Wilmslow, Cheshire SK9 5AF<br />
                United Kingdom
              </p>
              <p className="mt-2">
                Website: <a href="https://ico.org.uk" className="underline" target="_blank" rel="noopener noreferrer">https://ico.org.uk</a><br />
                Helpline: 0303 123 1113
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">12. Changes to this policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be notified via
              email or in-app banner. The current version is always available at this URL.
            </p>
          </section>

          <div className="pt-8 border-t text-sm text-muted-foreground">
            This Privacy Policy should be read alongside our{' '}
            <Link href="/terms" className="underline hover:text-foreground">
              Terms of Service
            </Link>
            .
          </div>
        </div>
      </div>
    </div>
  );
}
