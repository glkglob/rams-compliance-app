import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Terms of Service | RAMS Compliance Review',
  description: 'Terms and conditions for using the RAMS Compliance Review platform.',
};

export default function TermsOfServicePage() {
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
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
          </div>
          <p className="mt-2 text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10">
          <section>
            <h2 className="text-2xl font-semibold">1. Acceptance of terms</h2>
            <p>
              By creating an account or using the RAMS Compliance Review service (&quot;the Service&quot;), you
              agree to be bound by these Terms of Service and our{' '}
              <Link href="/privacy" className="underline">Privacy Policy</Link>. If you do not agree,
              you must not use the Service.
            </p>
            <p>
              These Terms form a contract between you (or the organisation you represent) and the
              operator of this instance of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">2. Description of the Service</h2>
            <p>
              The Service is an AI-assisted tool that helps construction professionals upload compliance
              source documents, extract requirements, and review subcontractor Risk Assessment and Method
              Statement (RAMS) submissions for compliance.
            </p>
            <p className="font-semibold text-destructive">
              IMPORTANT: The Service provides decision-support recommendations only. It is not a
              substitute for review by a competent person. All final compliance decisions, approvals,
              and site implementation remain your sole responsibility.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">3. Your responsibilities</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You must ensure that all information and documents you upload are accurate, lawful, and properly authorised for use in the Service.</li>
              <li>You are responsible for obtaining any necessary consents from individuals whose personal data appears in uploaded documents (including workers named in RAMS, COSHH assessments, or competency records).</li>
              <li>You must only grant appropriate roles to users and must not share login credentials.</li>
              <li>You must not upload documents containing classified, illegal, or infringing material.</li>
              <li>You are responsible for the accuracy of any compliance decisions made using the Service.</li>
              <li>You must implement the controls stated in approved RAMS on site.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">4. AI and automated outputs disclaimer</h2>
            <p>
              The Service uses large language models (AI) to analyse documents and generate:
            </p>
            <ul className="list-disc pl-6">
              <li>Extracted compliance requirements</li>
              <li>Compliance checks and scores</li>
              <li>Explanations and draft emails</li>
            </ul>
            <p className="mt-3">
              These outputs are generated probabilistically and may contain errors, omissions, or
              hallucinations. You must independently verify all AI-generated content before relying on it.
            </p>
            <p>
              We make no warranty that the AI will identify every compliance issue or that its
              recommendations are complete or correct.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">5. Health and safety — critical limitations</h2>
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 not-prose">
              <p className="font-semibold text-destructive">Construction (Design and Management) Regulations 2015 &amp; Health and Safety at Work etc. Act 1974</p>
              <p className="mt-2 text-sm">
                The Service is a support tool. Under UK law, duty holders (Principal Contractors,
                Contractors, Designers, etc.) retain full legal responsibility for health and safety.
                Use of this tool does not transfer or reduce any statutory duties. A &quot;competent person&quot;
                must always review and approve RAMS before work commences.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">6. Account deletion and data retention</h2>
            <p>
              You may delete your account at any time via the in-app account deletion tool or by
              contacting support. Upon confirmed deletion:
            </p>
            <ul className="list-disc pl-6">
              <li>Your profile and personal access will be removed.</li>
              <li>Projects you created and all data within them (documents, RAMS, reviews) will be permanently deleted.</li>
              <li>RAMS submissions you made to other projects will be deleted.</li>
            </ul>
            <p className="mt-3 text-sm">
              Notwithstanding the above, certain records may be retained for up to 6 years (or longer)
              where required by health and safety law, CDM 2015, insurance requirements, or to defend
              legal claims. See our Privacy Policy for full details.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">7. Intellectual property</h2>
            <p>
              You retain ownership of documents and RAMS you upload. By uploading material, you grant us
              a licence to process, store, and analyse it solely for the purpose of providing the Service.
            </p>
            <p>
              The Service, its software, prompts, models, and output formats (excluding your uploaded
              content) remain our property or that of our licensors.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">8. Acceptable use</h2>
            <p>You must not:</p>
            <ul className="list-disc pl-6">
              <li>Use the Service for any unlawful purpose or in breach of health and safety law</li>
              <li>Attempt to reverse-engineer, decompile, or extract training data from the AI models</li>
              <li>Upload material that infringes third-party rights or contains malicious code</li>
              <li>Interfere with the security or integrity of the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">9. Limitation of liability</h2>
            <p className="font-medium">
              To the maximum extent permitted by law:
            </p>
            <ul className="list-disc pl-6">
              <li>The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind.</li>
              <li>We are not liable for any direct, indirect, incidental, special, or consequential loss arising from use of the Service, including (but not limited to) personal injury, death, regulatory fines, or project delays.</li>
              <li>Nothing in these Terms excludes liability for death or personal injury caused by our negligence, fraud, or any other liability that cannot be excluded under English law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">10. Indemnity</h2>
            <p>
              You agree to indemnify and hold us harmless from any claims, losses, damages, or expenses
              (including reasonable legal fees) arising out of your use of the Service, your uploaded
              content, or any failure to comply with health and safety law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">11. Termination</h2>
            <p>
              We may suspend or terminate your access immediately if we reasonably believe you have
              breached these Terms or are using the Service in a way that creates safety or legal risk.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">12. Governing law and disputes</h2>
            <p>
              These Terms are governed by the laws of England and Wales. Any dispute arising out of or in
              connection with these Terms shall be subject to the exclusive jurisdiction of the courts of
              England and Wales.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">13. Contact</h2>
            <p>
              For questions about these Terms, account deletion, or data requests, please use the contact
              details provided by your organisation&rsquo;s administrator or the email address associated with
              your account welcome message.
            </p>
          </section>

          <div className="pt-8 border-t text-sm text-muted-foreground">
            These Terms should be read together with our{' '}
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </div>
        </div>
      </div>
    </div>
  );
}
