/**
 * End-to-end test: Full RAMS Review Pipeline
 *
 * Exercises the complete multi-agent orchestrator flow:
 *   1. Seeds test data (project, compliance doc, RAMS submission)
 *   2. Calls OpenAI 4× via the same prompt templates and schemas the app uses
 *   3. Runs the scoring engine
 *   4. Persists results to DB and verifies every table
 *   5. Cleans up all test data
 *
 * Usage:  npx tsx scripts/test-full-review.ts
 * Needs:  .env.local with SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, OPENAI_API_KEY
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { config } from 'dotenv';
import { resolve } from 'path';

// ─── Env ──────────────────────────────────────────────────────────────
config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiApiKey = process.env.OPENAI_API_KEY!;
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';

for (const [k, v] of Object.entries({ supabaseUrl, serviceRoleKey, openaiApiKey })) {
  if (!v) { console.error(`❌ Missing env var for ${k}`); process.exit(1); }
}

// Admin Supabase client (bypasses RLS)
const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const openai = new OpenAI({ apiKey: openaiApiKey, timeout: 90_000, maxRetries: 2 });

// ─── Prompt templates (identical to src/lib/ai/prompts.ts) ────────────
const REQUIREMENT_EXTRACTION_PROMPT = `You are a construction compliance expert. Extract mandatory compliance requirements from the provided document.

Instructions:
1. Extract ONLY mandatory requirements (must, shall, required, mandatory)
2. Ignore background information, suggestions, or recommendations
3. Assign severity based on this guidance:
   - critical: Safety-critical, legal, induction, emergency, permit, high-risk activities
   - major: Important project or operational requirements
   - minor: Administrative or low-risk requirements
4. Preserve exact source excerpts
5. Do not invent or infer requirements not explicitly stated

Document Category: {category}
Document Name: {documentName}
Document Text:
{documentText}

Return a JSON array of requirements.`;

const COMPLIANCE_COMPARISON_PROMPT = `You are a construction compliance auditor. Compare each requirement against the RAMS document evidence.

Instructions:
1. Check EVERY requirement against the RAMS content
2. For each requirement, find specific evidence in the RAMS
3. Be conservative: only mark "compliant" if the RAMS clearly satisfies the requirement
4. Use "partially_compliant" if the RAMS addresses it but not fully
5. Use "non_compliant" if no evidence is found
6. Use "not_applicable" only if the requirement is clearly irrelevant
7. Use "unclear" if the RAMS evidence is ambiguous
8. Include exact quotes from RAMS as evidence
9. Explain your reasoning clearly

Project Requirements:
{requirements}

RAMS Document Text:
{ramsText}

Return a JSON array of compliance checks.`;

const EXPLANATION_PROMPT = `You are a construction compliance expert. Generate a clear, professional explanation of the RAMS review decision.

Instructions:
1. Use plain construction/compliance language
2. Explain the decision clearly
3. Include required corrections if rejected
4. Include uncertainty if manual review is needed
5. Do not overstate certainty
6. Never claim legal certification or safety guarantees

Review Results:
- Compliance Score: {complianceScore}%
- Threshold: {threshold}%
- Decision: {decision}
- Critical Failures: {criticalFailures}
- Major Failures: {majorFailures}
- Unclear Checks: {unclearChecks}

Compliance Checks:
{checks}

Return a JSON object with the explanation.`;

const EMAIL_APPROVAL_PROMPT = `Generate a professional approval email for a RAMS submission.

Project: {projectName}
Subcontractor: {subcontractorName}
Compliance Score: {complianceScore}%
Threshold: {threshold}%

Summary: {summary}
Next Steps: The RAMS has been approved. Please ensure all controls are implemented on site.

Include the mandatory disclaimer: "This automated review is a compliance support tool. Final approval should be confirmed by a competent person before work starts."

Return JSON with subject and body.`;

const EMAIL_REJECTION_PROMPT = `Generate a professional rejection email for a RAMS submission.

Project: {projectName}
Subcontractor: {subcontractorName}
Compliance Score: {complianceScore}%
Threshold: {threshold}%
Reason for Rejection: {reason}

Required Corrections:
{corrections}

Request resubmission after corrections are made.

Include the mandatory disclaimer: "This automated review is a compliance support tool. Final approval should be confirmed by a competent person before work starts."

Return JSON with subject and body.`;

const EMAIL_MANUAL_REVIEW_PROMPT = `Generate a professional email for a RAMS submission requiring manual review.

Project: {projectName}
Subcontractor: {subcontractorName}
Reason for Manual Review: {reason}

Include the mandatory disclaimer: "This automated review is a compliance support tool. Final approval should be confirmed by a competent person before work starts."

Do NOT say the RAMS is approved or rejected.

Return JSON with subject and body.`;

// ─── Realistic test documents ─────────────────────────────────────────
const SAMPLE_COMPLIANCE_TEXT = `
CONSTRUCTION PHASE HEALTH AND SAFETY PLAN - PROJECT REQUIREMENTS

1. SITE INDUCTION AND TRAINING REQUIREMENTS
1.1 All operatives must complete a site-specific induction before commencing any work on site.
1.2 All workers must hold a valid CSCS card appropriate to their trade. Proof must be provided prior to starting work.
1.3 Subcontractors must provide evidence of operative competency for high-risk activities including working at height, confined spaces, and hot works.

2. PERSONAL PROTECTIVE EQUIPMENT (PPE) REQUIREMENTS
2.1 Minimum PPE shall be worn at all times on site: hard hat (EN 397), high-visibility vest (EN ISO 20471 Class 2), safety boots (EN ISO 20345 S3), safety glasses (EN 166).
2.2 Task-specific RPE must be provided for dust-generating activities. Face-fit testing certificates are required.
2.3 All PPE must be inspected daily and defective items replaced immediately.

3. WORKING AT HEIGHT
3.1 A working at height risk assessment must be submitted for all activities above 2 metres.
3.2 Edge protection must be installed before any work at height commences.
3.3 All scaffolding must be erected by CISRS-certified scaffolders and inspected weekly. Scaffold tags must be displayed.
3.4 Mobile Elevated Work Platforms (MEWPs) operators must hold valid IPAF certification.

4. FIRE SAFETY AND EMERGENCY PROCEDURES
4.1 All subcontractors must participate in the site emergency evacuation procedure.
4.2 Hot works require a valid hot works permit signed by the principal contractor.
4.3 Fire extinguishers must be provided within 10 metres of any hot works operation.
4.4 Emergency contact details and nearest hospital route must be displayed in the site welfare facilities.

5. RISK ASSESSMENTS AND METHOD STATEMENTS
5.1 RAMS must be submitted and approved before any work commences on site.
5.2 RAMS must be task-specific and reviewed if site conditions change.
5.3 All operatives must sign to confirm they have read and understood the RAMS relevant to their task.

6. PERMITS TO WORK
6.1 Permits to work are mandatory for: hot works, confined space entry, electrical isolation, excavation works, and crane lifts.
6.2 Permits must be obtained from the site manager at least 24 hours before the planned activity.

7. WASTE MANAGEMENT
7.1 All subcontractors are required to segregate waste into designated skips.
7.2 Hazardous waste must be stored separately with appropriate COSHH data sheets displayed.
7.3 A waste transfer note must be provided for all waste removed from site.

8. MANUAL HANDLING
8.1 Manual handling assessments must be completed for tasks involving loads exceeding 25kg.
8.2 Mechanical aids shall be used where reasonably practicable.

9. COSHH (CONTROL OF SUBSTANCES HAZARDOUS TO HEALTH)
9.1 COSHH assessments must be provided for all hazardous substances brought onto site.
9.2 Safety data sheets must be available at the point of use.
9.3 Hazardous substances must be stored in locked, bunded containers when not in use.
`;

const SAMPLE_RAMS_TEXT = `
RISK ASSESSMENT AND METHOD STATEMENT
Mechanical & Electrical Installation - Office Block B

Subcontractor: Sparks Electrical Ltd
Date: 15 May 2026
Revision: 2

1. SCOPE OF WORKS
Installation of mechanical and electrical services within Office Block B including:
- First and second fix electrical installation
- Cable containment and trunking
- Distribution board installation
- Lighting installation including emergency lighting
- Fire alarm system installation
- Data cabling infrastructure

2. RISK ASSESSMENT

| Hazard | Risk | Control Measure | Residual Risk |
|--------|------|-----------------|---------------|
| Working at height | Falls from height | Use of MEWP with trained IPAF operator. Edge protection in place. Harness worn when on MEWP. | Low |
| Electrical hazard | Electrocution | All circuits isolated and locked off before work. Permit to work for live testing. GS38 test equipment. | Low |
| Manual handling | Musculoskeletal injury | Distribution boards lifted by 2-person team. Mechanical aids for items over 25kg. Manual handling training provided. | Low |
| Dust from drilling | Respiratory harm | RPE provided (FFP3 masks). Dust extraction used on all core drilling. Face-fit tested. | Low |
| Fire risk - hot works | Fire/burns | Hot works permit obtained. Fire extinguisher within 5m. Fire watch maintained for 60 mins after works. | Low |
| Slips, trips, falls | Injury | Housekeeping maintained. Cables routed overhead or in trunking. Work area swept at end of each day. | Low |
| Noise | Hearing damage | Ear defenders provided when noise >80dB(A). Hearing zones signed. | Low |

3. METHOD STATEMENT

3.1 Pre-Start
- Site-specific induction completed by all operatives
- All operatives hold valid CSCS cards (Electrician grade)
- RAMS briefing delivered and sign-off sheet completed
- Work area inspected and confirmed safe by site supervisor

3.2 First Fix
- Cable routes marked out per approved drawings
- Containment installed (tray, trunking, conduit)
- Cables pulled to distribution boards
- All penetrations fire-stopped to maintain compartmentation

3.3 Second Fix
- Accessories installed (sockets, switches, luminaires)
- Distribution boards terminated
- Emergency lighting installed and tested
- Fire alarm devices installed per approved design

3.4 Testing and Commissioning
- All circuits tested per BS 7671
- Test certificates issued (EIC/EICR)
- Emergency lighting tested (3-hour duration test)
- Fire alarm commissioned by certified engineer

4. PERSONAL PROTECTIVE EQUIPMENT
Minimum PPE at all times:
- Hard hat (EN 397)
- High-visibility vest (EN ISO 20471 Class 2)
- Safety boots (EN ISO 20345 S3)
- Safety glasses (EN 166)
Additional task-specific:
- RPE (FFP3) for dust-generating activities — all operatives face-fit tested
- Insulated gloves for electrical testing
- Ear defenders for noisy operations

5. EMERGENCY PROCEDURES
- All operatives aware of site emergency evacuation procedure and muster point
- First aider on site at all times (John Smith, cert. expiry 12/2026)
- Nearest A&E: Royal Hospital, 2.1 miles — route displayed in welfare cabin
- Emergency contact: Site Manager 07700 900123

6. PERMITS TO WORK
- Hot works permit required and will be obtained 24 hours in advance
- Electrical isolation permit for live testing
- All permits filed in site office

7. WASTE MANAGEMENT
- Waste segregated into designated skips (general, metals, cardboard)
- Cable offcuts collected and recycled
- WEEE waste disposed via licensed carrier
- Waste transfer notes retained

8. TRAINING AND COMPETENCY
All operatives:
- CSCS card (Gold - Electrician)
- IPAF 3a/3b for MEWP operation
- ECS card (Electrotechnical)
- Manual handling awareness
- Asbestos awareness
- Face-fit tested for RPE

Supervisors additionally:
- SSSTS qualified
- First aid at work

9. COSHH
Substances used on this project:
- Cable lubricant: low hazard, SDS available
- Fire-stop mastic: irritant, RPE and gloves required, SDS available
- PVC cement: flammable, use in ventilated area, SDS available
All COSHH assessments filed in site COSHH register. SDSs available at point of use. Hazardous substances stored in locked container in compound.

Prepared by: James Wilson, Contracts Manager
Reviewed by: Sarah Chen, SHEQ Director
Approved by: Mark Thompson, Managing Director
`;

// ─── Helpers ──────────────────────────────────────────────────────────
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const start = Date.now();
  const response = await openai.chat.completions.create({
    model: openaiModel,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 4000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from OpenAI');

  const dur = Date.now() - start;
  console.log(`    OpenAI ${openaiModel} — ${dur}ms | ${response.usage?.prompt_tokens ?? '?'}p + ${response.usage?.completion_tokens ?? '?'}c tokens`);
  return content;
}

// Scoring engine — replicated from src/lib/scoring/calculate-compliance-score.ts
function calculateComplianceScore(
  checks: any[],
  threshold: number,
  extractionConfidence?: number
) {
  const weights: Record<string, number> = { critical: 3, major: 2, minor: 1 };
  const criticalFailures = checks.filter(c => c.severity === 'critical' && c.status === 'non_compliant').length;
  const majorFailures = checks.filter(c => c.severity === 'major' && c.status === 'non_compliant').length;
  const minorFailures = checks.filter(c => c.severity === 'minor' && c.status === 'non_compliant').length;
  const unclearChecks = checks.filter(c => c.status === 'unclear').length;

  let totalWeightedScore = 0;
  let totalWeight = 0;
  for (const check of checks) {
    if (check.status === 'not_applicable') continue;
    const w = weights[check.severity] ?? 1;
    totalWeight += w;
    if (check.status === 'compliant') totalWeightedScore += w;
    else if (check.status === 'partially_compliant') totalWeightedScore += w * 0.5;
  }

  const complianceScore = totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) : 0;
  const confidenceScore = Math.min(
    extractionConfidence ?? 1,
    checks.length > 0 ? 1 - (unclearChecks / checks.length) : 1
  );

  let decision: string = 'manual_review';
  let reason = '';

  if (!checks.length) {
    reason = 'No compliance requirements found for comparison.';
  } else if (extractionConfidence !== undefined && extractionConfidence < 0.7) {
    reason = 'Document extraction confidence is too low for automatic review.';
  } else if (confidenceScore < 0.75) {
    reason = 'AI confidence score is below 75% threshold for automatic decisions.';
  } else if (unclearChecks > checks.length * 0.25) {
    reason = `More than 25% of checks are unclear (${unclearChecks} of ${checks.length}).`;
  } else if (criticalFailures > 0) {
    decision = 'rejected';
    reason = `RAMS rejected due to ${criticalFailures} critical compliance failure(s).`;
  } else if (complianceScore >= threshold) {
    decision = 'approved';
    reason = `RAMS approved with ${complianceScore}% compliance score (threshold: ${threshold}%).`;
  } else {
    decision = 'rejected';
    reason = `RAMS rejected with ${complianceScore}% compliance score (threshold: ${threshold}%).`;
  }

  return { complianceScore, threshold, decision, criticalFailures, majorFailures, minorFailures, unclearChecks, confidenceScore, reason };
}

// ─── Tracking IDs ─────────────────────────────────────────────────────
let testProjectId: string | null = null;
let testComplianceDocId: string | null = null;
let testRamsSubmissionId: string | null = null;
let testUserId: string | null = null;

// ─── Pipeline ─────────────────────────────────────────────────────────
async function run() {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  RAMS Review Pipeline — Full End-to-End Test                ║');
  console.log('║  Orchestrator + 4 AI Agents + Scoring + Persistence        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`  Model: ${openaiModel}`);
  console.log(`  Supabase: ${supabaseUrl}\n`);

  try {
    // ── Step 0: Find test user ───────────────────────────────────────
    console.log('▸ Step 0: Finding test user...');
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, role, email')
      .limit(5);

    const adminProfile = (profiles || []).find((p: any) => p.role === 'admin');
    const profile = adminProfile || (profiles && profiles[0]);

    if (!profile) {
      console.error('  ✗ No users found. Sign up at least one user in the app first.');
      process.exit(1);
    }
    testUserId = (profile as any).id;
    console.log(`  ✓ Using user: ${(profile as any).email} (${(profile as any).role})\n`);

    // ── Step 1: Create test project ──────────────────────────────────
    console.log('▸ Step 1: Creating test project...');
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .insert({
        name: '[E2E Test] Office Block B — M&E Install',
        description: 'End-to-end pipeline test project — auto-generated',
        status: 'active',
        compliance_threshold: 75,
        created_by: testUserId,
      })
      .select()
      .single();

    if (projErr) throw new Error(`Create project failed: ${projErr.message}`);
    testProjectId = project.id;
    console.log(`  ✓ Project: ${project.id} (threshold ${project.compliance_threshold}%)\n`);

    // Add project membership
    await supabase.from('project_members').insert({
      project_id: project.id,
      user_id: testUserId,
      role: 'admin',
    });

    // ── Step 2: Create compliance document ───────────────────────────
    console.log('▸ Step 2: Creating compliance document (pre-extracted text)...');
    const { data: compDoc, error: compDocErr } = await supabase
      .from('compliance_documents')
      .insert({
        project_id: project.id,
        file_name: 'Construction Phase H&S Plan.pdf',
        file_type: 'pdf',
        file_size: 245000,
        storage_path: `${project.id}/compliance-docs/e2e-test-plan.pdf`,
        document_category: 'health_and_safety',
        extraction_status: 'complete',
        extracted_text: SAMPLE_COMPLIANCE_TEXT,
        extraction_confidence: 0.95,
      })
      .select()
      .single();

    if (compDocErr) throw new Error(`Create compliance doc failed: ${compDocErr.message}`);
    testComplianceDocId = compDoc.id;
    console.log(`  ✓ Doc: ${compDoc.id} (${SAMPLE_COMPLIANCE_TEXT.length} chars)\n`);

    // ── Step 3: Create RAMS submission ───────────────────────────────
    console.log('▸ Step 3: Creating RAMS submission (pre-extracted text)...');
    const { data: rams, error: ramsErr } = await supabase
      .from('rams_submissions')
      .insert({
        project_id: project.id,
        subcontractor_name: 'Sparks Electrical Ltd',
        subcontractor_email: 'james.wilson@sparks-electrical.co.uk',
        trade_package: 'Mechanical & Electrical',
        file_name: 'Sparks_Electrical_RAMS_Block_B.pdf',
        file_type: 'pdf',
        file_size: 180000,
        storage_path: `${project.id}/rams/e2e-test-rams.pdf`,
        submitted_by: testUserId,
        review_status: 'pending',
        extracted_text: SAMPLE_RAMS_TEXT,
        confidence_score: 0.92,
      })
      .select()
      .single();

    if (ramsErr) throw new Error(`Create RAMS failed: ${ramsErr.message}`);
    testRamsSubmissionId = rams.id;
    console.log(`  ✓ RAMS: ${rams.id} (${SAMPLE_RAMS_TEXT.length} chars)\n`);

    // ═══════════════════════════════════════════════════════════════
    //  AGENT 1: Requirement Extraction
    // ═══════════════════════════════════════════════════════════════
    console.log('▸ Agent 1: REQUIREMENT EXTRACTION');
    console.log('  Extracting mandatory requirements from compliance document...');

    const reqPrompt = REQUIREMENT_EXTRACTION_PROMPT
      .replace('{category}', 'health_and_safety')
      .replace('{documentName}', 'Construction Phase H&S Plan.pdf')
      .replace('{documentText}', SAMPLE_COMPLIANCE_TEXT.substring(0, 8000));

    const reqResponse = await callOpenAI(
      'You are a construction compliance expert. Always return valid JSON.',
      reqPrompt,
      { temperature: 0.2, maxTokens: 3000 }
    );

    const reqParsed = JSON.parse(reqResponse);
    const rawRequirements = Array.isArray(reqParsed.requirements)
      ? reqParsed.requirements
      : Array.isArray(reqParsed)
        ? reqParsed
        : [];

    // Debug: show the raw AI output structure
    if (rawRequirements.length > 0) {
      console.log(`  Raw keys from AI: ${Object.keys(rawRequirements[0]).join(', ')}`);
      console.log(`  Sample item: ${JSON.stringify(rawRequirements[0]).substring(0, 300)}`);
    } else {
      console.log(`  Raw response keys: ${Object.keys(reqParsed).join(', ')}`);
      // Check if the AI returned a different structure
      const firstKey = Object.keys(reqParsed)[0];
      if (firstKey && Array.isArray(reqParsed[firstKey])) {
        console.log(`  Trying key '${firstKey}': ${JSON.stringify(reqParsed[firstKey][0]).substring(0, 300)}`);
      } else {
        console.log(`  Full response preview: ${JSON.stringify(reqParsed).substring(0, 500)}`);
      }
    }

    const requirements = rawRequirements
      .map((req: any) => {
        // Normalise: AI returns varying key structures
        const text = req.requirementText || req.requirement_text || req.text || req.description || req.excerpt || '';
        return {
          requirementCode: req.requirementCode || req.requirement_code || req.code || req.id || `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          requirementText: text,
          category: req.category || 'health_and_safety',
          severity: req.severity || 'major',
          sourceDocumentId: compDoc.id,
          sourceDocumentName: 'Construction Phase H&S Plan.pdf',
          sourceExcerpt: req.sourceExcerpt || req.source_excerpt || req.excerpt || text,
        };
      })
      .filter((req: any) => typeof req.requirementText === 'string' && req.requirementText.trim().length > 0);

    console.log(`  ✓ Extracted ${requirements.length} requirements`);
    const bySeverity = {
      critical: requirements.filter((r: any) => r.severity === 'critical').length,
      major: requirements.filter((r: any) => r.severity === 'major').length,
      minor: requirements.filter((r: any) => r.severity === 'minor').length,
    };
    console.log(`    Critical: ${bySeverity.critical} | Major: ${bySeverity.major} | Minor: ${bySeverity.minor}`);

    // Persist requirements and capture DB UUIDs
    const requirementDbIds = new Map<string, string>();
    if (requirements.length > 0) {
      const { data: insertedReqs, error: reqInsertErr } = await supabase
        .from('compliance_requirements')
        .insert(requirements.map((r: any) => ({
          project_id: project.id,
          source_document_id: r.sourceDocumentId,
          requirement_code: r.requirementCode,
          requirement_text: r.requirementText,
          category: r.category,
          severity: r.severity,
          source_excerpt: r.sourceExcerpt,
        })))
        .select('id, requirement_code');

      if (reqInsertErr) {
        console.log(`  ✗ DB insert failed: ${reqInsertErr.message}`);
      } else {
        for (const row of (insertedReqs || []) as any[]) {
          requirementDbIds.set(row.requirement_code, row.id);
        }
        console.log(`  ✓ Saved ${requirementDbIds.size} to compliance_requirements`);
      }
      console.log();
    }

    if (requirements.length === 0) {
      throw new Error('No requirements extracted — cannot continue pipeline');
    }

    // ═══════════════════════════════════════════════════════════════
    //  AGENT 2: Compliance Comparison
    // ═══════════════════════════════════════════════════════════════
    console.log('▸ Agent 2: COMPLIANCE COMPARISON');
    console.log('  Comparing RAMS against each requirement...');

    const compPrompt = COMPLIANCE_COMPARISON_PROMPT
      .replace('{requirements}', JSON.stringify(requirements))
      .replace('{ramsText}', SAMPLE_RAMS_TEXT);

    const compResponse = await callOpenAI(
      'You are a construction compliance auditor. Always return valid JSON.',
      compPrompt,
      { temperature: 0.2, maxTokens: 8000 }
    );

    const compParsed = JSON.parse(compResponse);

    // Debug: see what the AI actually returned
    console.log(`  Response top-level keys: ${Object.keys(compParsed).join(', ')}`);
    const firstArrayKey = Object.keys(compParsed).find(k => Array.isArray(compParsed[k]));
    if (firstArrayKey) {
      console.log(`  Array found under key '${firstArrayKey}' (${compParsed[firstArrayKey].length} items)`);
      if (compParsed[firstArrayKey].length > 0) {
        console.log(`  Item keys: ${Object.keys(compParsed[firstArrayKey][0]).join(', ')}`);
        console.log(`  Sample: ${JSON.stringify(compParsed[firstArrayKey][0]).substring(0, 300)}`);
      }
    }

    // Flexibly find the checks array
    const rawChecks: any[] = compParsed.checks ?? compParsed.compliance_checks ?? compParsed.results ?? (firstArrayKey ? compParsed[firstArrayKey] : []);

    // Normalise each raw check: AI returns varying key names
    const normalisedChecks = rawChecks.map((c: any) => ({
      requirementId: c.requirementId ?? c.requirementCode ?? c.requirement_id ?? c.id ?? '',
      status: c.status ?? c.complianceStatus ?? c.compliance_status ?? 'unclear',
      ramsEvidence: c.ramsEvidence ?? c.rams_evidence ?? c.evidence ?? 'No evidence found',
      explanation: c.explanation ?? c.reasoning ?? c.reason ?? 'Unable to verify compliance',
      score: typeof c.score === 'number' ? c.score : (c.status === 'compliant' || c.complianceStatus === 'compliant' ? 1 : c.status === 'partially_compliant' || c.complianceStatus === 'partially_compliant' ? 0.5 : 0),
    }));

    // Map checks back to requirements with fuzzy + positional fallback
    const consumed = new Set<number>();
    const checks = requirements.map((req: any, reqIdx: number) => {
      // Exact match
      let matchIdx = normalisedChecks.findIndex(
        (c: any, i: number) => !consumed.has(i) && c.requirementId === req.requirementCode
      );
      // Normalised match
      if (matchIdx === -1) {
        const normCode = req.requirementCode.toLowerCase().replace(/[\s_-]/g, '');
        matchIdx = normalisedChecks.findIndex(
          (c: any, i: number) => !consumed.has(i) && typeof c.requirementId === 'string' &&
            c.requirementId.toLowerCase().replace(/[\s_-]/g, '') === normCode
        );
      }
      // Positional fallback
      if (matchIdx === -1 && reqIdx < normalisedChecks.length && !consumed.has(reqIdx)) {
        matchIdx = reqIdx;
      }
      const check = matchIdx >= 0 ? normalisedChecks[matchIdx] : undefined;
      if (matchIdx >= 0) consumed.add(matchIdx);

      return {
        requirementId: req.requirementCode,
        status: check?.status ?? 'unclear',
        severity: req.severity,
        requirement: req.requirementText,
        ramsEvidence: check?.ramsEvidence ?? 'No evidence found',
        sourceExcerpt: req.sourceExcerpt,
        explanation: check?.explanation ?? 'Unable to verify compliance',
        score: typeof check?.score === 'number' ? check.score : 0,
      };
    });

    const statusCounts: Record<string, number> = {};
    for (const c of checks) { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; }
    console.log(`  ✓ ${checks.length} checks completed`);
    console.log(`    ${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(' | ')}\n`);

    // ═══════════════════════════════════════════════════════════════
    //  SCORING ENGINE
    // ═══════════════════════════════════════════════════════════════
    console.log('▸ Scoring Engine: CALCULATE COMPLIANCE SCORE');
    const scoring = calculateComplianceScore(checks, project.compliance_threshold, 0.92);
    console.log(`  Score: ${scoring.complianceScore}% (threshold: ${scoring.threshold}%)`);
    console.log(`  Decision: ${scoring.decision}`);
    console.log(`  Reason: ${scoring.reason}`);
    console.log(`  Confidence: ${scoring.confidenceScore.toFixed(2)}`);
    console.log(`  Critical failures: ${scoring.criticalFailures} | Major: ${scoring.majorFailures} | Minor: ${scoring.minorFailures} | Unclear: ${scoring.unclearChecks}\n`);

    // ═══════════════════════════════════════════════════════════════
    //  AGENT 3: Explanation Generation
    // ═══════════════════════════════════════════════════════════════
    console.log('▸ Agent 3: EXPLANATION GENERATION');
    console.log('  Generating human-readable decision explanation...');

    const explPrompt = EXPLANATION_PROMPT
      .replace('{complianceScore}', scoring.complianceScore.toString())
      .replace('{threshold}', scoring.threshold.toString())
      .replace('{decision}', scoring.decision)
      .replace('{criticalFailures}', scoring.criticalFailures.toString())
      .replace('{majorFailures}', scoring.majorFailures.toString())
      .replace('{unclearChecks}', scoring.unclearChecks.toString())
      .replace('{checks}', JSON.stringify(checks, null, 2));

    const explResponse = await callOpenAI(
      'You are a construction compliance expert. Always return valid JSON.',
      explPrompt,
      { temperature: 0.3, maxTokens: 2000 }
    );

    const explParsed = JSON.parse(explResponse);
    const explanation = {
      summary: explParsed.summary || `${scoring.decision}. Score: ${scoring.complianceScore}%`,
      passedItems: explParsed.passedItems || [],
      failedItems: explParsed.failedItems || [],
      unclearItems: explParsed.unclearItems || [],
      requiredCorrections: explParsed.requiredCorrections || [],
      disclaimer: 'This automated review is a compliance support tool. Final approval should be confirmed by a competent person before work starts.',
    };

    console.log(`  ✓ Summary: ${explanation.summary.substring(0, 120)}...`);
    console.log(`    Passed: ${explanation.passedItems.length} | Failed: ${explanation.failedItems.length} | Unclear: ${explanation.unclearItems.length}`);
    if (explanation.requiredCorrections.length > 0) {
      console.log(`    Required corrections: ${explanation.requiredCorrections.length}`);
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════
    //  AGENT 4: Email Generation
    // ═══════════════════════════════════════════════════════════════
    console.log('▸ Agent 4: EMAIL GENERATION');
    console.log(`  Generating ${scoring.decision} email...`);

    let emailPrompt: string;
    switch (scoring.decision) {
      case 'approved':
        emailPrompt = EMAIL_APPROVAL_PROMPT
          .replace('{projectName}', project.name)
          .replace('{subcontractorName}', rams.subcontractor_name)
          .replace('{complianceScore}', scoring.complianceScore.toString())
          .replace('{threshold}', scoring.threshold.toString())
          .replace('{summary}', explanation.summary);
        break;
      case 'rejected':
        emailPrompt = EMAIL_REJECTION_PROMPT
          .replace('{projectName}', project.name)
          .replace('{subcontractorName}', rams.subcontractor_name)
          .replace('{complianceScore}', scoring.complianceScore.toString())
          .replace('{threshold}', scoring.threshold.toString())
          .replace('{reason}', scoring.reason)
          .replace('{corrections}', (explanation.requiredCorrections || []).join('\n'));
        break;
      default:
        emailPrompt = EMAIL_MANUAL_REVIEW_PROMPT
          .replace('{projectName}', project.name)
          .replace('{subcontractorName}', rams.subcontractor_name)
          .replace('{reason}', scoring.reason);
    }

    const emailResponse = await callOpenAI(
      'You are a professional construction project manager. Always return valid JSON.',
      emailPrompt,
      { temperature: 0.3, maxTokens: 1000 }
    );

    const emailParsed = JSON.parse(emailResponse);
    const email = {
      subject: emailParsed.subject || `RAMS Review Update - ${project.name}`,
      body: emailParsed.body || 'Please contact the project team for more information.',
    };

    console.log(`  ✓ Subject: ${email.subject}`);
    console.log(`    Body preview: ${email.body.substring(0, 120)}...\n`);

    // ═══════════════════════════════════════════════════════════════
    //  PERSIST RESULTS
    // ═══════════════════════════════════════════════════════════════
    console.log('▸ Persisting results to database...');

    // Save review
    const { data: review, error: reviewErr } = await supabase
      .from('rams_reviews')
      .insert({
        rams_submission_id: rams.id,
        review_status: scoring.decision,
        compliance_score: scoring.complianceScore,
        confidence_score: scoring.confidenceScore,
        decision_explanation: explanation.summary,
        email_generated: true,
        email_sent: false,
      })
      .select()
      .single();

    if (reviewErr) throw new Error(`Save review failed: ${reviewErr.message}`);
    console.log(`  ✓ rams_reviews: ${review.id}`);

    // Save checks (use DB UUIDs, not code strings)
    if (checks.length > 0) {
      const checkRows = checks
        .map((check: any) => ({
          rams_review_id: review.id,
          requirement_id: requirementDbIds.get(check.requirementId) ?? null,
          status: check.status,
          severity: check.severity,
          score: check.score,
          rams_evidence: check.ramsEvidence,
          explanation: check.explanation,
        }))
        .filter((row: any) => row.requirement_id !== null);

      if (checkRows.length > 0) {
        const { error: checksErr } = await supabase.from('review_checks').insert(checkRows);
        console.log(`  ${checksErr ? '✗ review_checks: ' + checksErr.message : `✓ review_checks: ${checkRows.length} rows`}`);
      }
      if (checkRows.length < checks.length) {
        console.log(`  ⚠ ${checks.length - checkRows.length} checks skipped (no matching DB requirement)`);
      }
    }

    // Save email
    const { error: emailErr } = await supabase.from('generated_emails').insert({
      rams_submission_id: rams.id,
      subject: email.subject,
      body: email.body,
      sent: false,
    });
    console.log(`  ${emailErr ? '✗ generated_emails: ' + emailErr.message : '✓ generated_emails: 1 row'}`);

    // Update RAMS submission
    const { error: updateErr } = await supabase
      .from('rams_submissions')
      .update({
        review_status: scoring.decision,
        compliance_score: scoring.complianceScore,
        confidence_score: scoring.confidenceScore,
        decision_explanation: explanation.summary,
      })
      .eq('id', rams.id);
    console.log(`  ${updateErr ? '✗ rams_submissions update: ' + updateErr.message : '✓ rams_submissions: updated'}`);

    // Audit log
    const { error: auditErr } = await supabase.from('audit_logs').insert({
      user_id: testUserId,
      action: 'REVIEW_RAMS',
      entity_type: 'rams_submission',
      entity_id: rams.id,
      details: {
        decision: scoring.decision,
        score: scoring.complianceScore,
        checks: checks.length,
        test: true,
      },
    });
    console.log(`  ${auditErr ? '✗ audit_logs: ' + auditErr.message : '✓ audit_logs: 1 row'}`);

    // ═══════════════════════════════════════════════════════════════
    //  VERIFICATION
    // ═══════════════════════════════════════════════════════════════
    console.log('\n▸ Verification: Cross-checking persisted data...');

    const { count: reqCount } = await supabase
      .from('compliance_requirements')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id);

    const { count: checkCount } = await supabase
      .from('review_checks')
      .select('*', { count: 'exact', head: true })
      .eq('rams_review_id', review.id);

    const { data: finalRams } = await supabase
      .from('rams_submissions')
      .select('review_status, compliance_score')
      .eq('id', rams.id)
      .single();

    console.log(`  compliance_requirements: ${reqCount ?? 0} rows`);
    console.log(`  review_checks: ${checkCount ?? 0} rows`);
    console.log(`  rams_submissions status: ${(finalRams as any)?.review_status} (score: ${(finalRams as any)?.compliance_score}%)`);

    // ═══════════════════════════════════════════════════════════════
    //  SUMMARY
    // ═══════════════════════════════════════════════════════════════
    const totalDuration = Date.now() - startTime;
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  PIPELINE RESULT                                            ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Decision:       ${scoring.decision.padEnd(43)}║`);
    console.log(`║  Score:          ${(scoring.complianceScore + '%').padEnd(43)}║`);
    console.log(`║  Confidence:     ${scoring.confidenceScore.toFixed(2).padEnd(43)}║`);
    console.log(`║  Requirements:   ${requirements.length.toString().padEnd(43)}║`);
    console.log(`║  Checks:         ${checks.length.toString().padEnd(43)}║`);
    console.log(`║  AI calls:       ${'4 (extract → compare → explain → email)'.padEnd(43)}║`);
    console.log(`║  Total time:     ${((totalDuration / 1000).toFixed(1) + 's').padEnd(43)}║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n✅ Full pipeline completed successfully!');

  } catch (error) {
    console.error('\n❌ Pipeline failed:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  } finally {
    console.log('\n▸ Cleanup: Removing test data...');
    await cleanup();
    console.log('  ✓ Test data removed.\n');
  }
}

async function cleanup() {
  try {
    if (testRamsSubmissionId) {
      await supabase.from('generated_emails').delete().eq('rams_submission_id', testRamsSubmissionId);

      const { data: reviews } = await supabase
        .from('rams_reviews')
        .select('id')
        .eq('rams_submission_id', testRamsSubmissionId);
      for (const rev of (reviews || []) as any[]) {
        await supabase.from('review_checks').delete().eq('rams_review_id', rev.id);
      }
      await supabase.from('rams_reviews').delete().eq('rams_submission_id', testRamsSubmissionId);
      await supabase.from('audit_logs').delete().eq('entity_id', testRamsSubmissionId);
      await supabase.from('rams_submissions').delete().eq('id', testRamsSubmissionId);
    }
    if (testProjectId) {
      await supabase.from('compliance_requirements').delete().eq('project_id', testProjectId);
      await supabase.from('compliance_documents').delete().eq('project_id', testProjectId);
      await supabase.from('project_members').delete().eq('project_id', testProjectId);
      await supabase.from('audit_logs').delete().eq('entity_id', testProjectId);
      await supabase.from('projects').delete().eq('id', testProjectId);
    }
  } catch (e) {
    console.error('  ⚠ Cleanup error (non-fatal):', e instanceof Error ? e.message : String(e));
  }
}

run();
