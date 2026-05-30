export const REQUIREMENT_EXTRACTION_PROMPT = `You are a construction compliance expert. Extract mandatory compliance requirements from the provided document.

Instructions:
1. Extract ONLY mandatory requirements (must, shall, required, mandatory)
2. Ignore background information, suggestions, or recommendations
3. Assign severity based on this guidance:
   - critical: Safety-critical, legal, induction, emergency, permit, high-risk activities
   - major: Important project or operational requirements
   - minor: Administrative or low-risk requirements
4. Categorize EACH requirement independently (see Categorization below)
5. Preserve exact source excerpts
6. Do not invent or infer requirements not explicitly stated

Categorization:
- Analyze every requirement on its own and assign the single category that best
  matches WHAT THE REQUIREMENT IS ABOUT — its actual content and intent.
- Do NOT just copy the Document Category onto every requirement. A single
  document usually contains requirements that belong to different categories.
  The Document Category is only a weak hint and a last-resort fallback when a
  requirement's content does not clearly fit any other category.
- Choose exactly one category per requirement from this list (use the slug):
  - health_and_safety: PPE, risk control, safe systems of work, permits,
    inductions, emergency/first aid, working at height, COSHH, plant/equipment safety
  - site_rules: on-site conduct, access/egress, signing in, parking, welfare,
    housekeeping, smoking/alcohol, speed limits, site hours
  - environment: waste management, spill control, emissions, noise, dust,
    pollution prevention, ecology
  - quality: workmanship standards, materials specifications, inspections,
    testing, tolerances, certifications of work
  - project_policy: project-specific governance, roles, reporting lines,
    document control, project-specific procedures
  - company_policy: organisation-wide policies and standards
  - client_requirements: obligations specifically imposed by the client
  - terms_and_conditions: contractual/commercial terms, insurance, liability,
    payment, programme/contract obligations
  - other: only when the requirement genuinely fits none of the above
- Prefer the most specific applicable category. When two could apply, pick the
  one that reflects the requirement's primary purpose.

Few-shot categorization examples (note: these come from the SAME document yet
receive DIFFERENT categories based on their individual content):
- Requirement: "All operatives must wear high-visibility clothing and safety
  footwear at all times within the works area."
  -> category: "health_and_safety"
- Requirement: "All personnel must sign in at the site office on arrival and
  sign out before leaving the site each day."
  -> category: "site_rules"
- Requirement: "Waste must be segregated into the designated skips and removed
  by a licensed carrier with duty-of-care documentation retained."
  -> category: "environment"

Document Category (weak hint / fallback only): {category}
Document Name: {documentName}
Document Text:
{documentText}

Return a JSON array of requirements. Each requirement object MUST include a
"category" field set to the per-requirement category slug chosen above.`;

export const RAMS_ANALYSIS_PROMPT = `You are a construction safety expert. Analyze the submitted RAMS document.

Instructions:
1. Identify which standard RAMS sections are present
2. Extract key controls and safety measures mentioned
3. Identify missing critical sections
4. Highlight unclear or ambiguous wording
5. Do not infer controls that are not explicitly stated
6. Be precise about what the RAMS actually says

Required sections to detect:
- scope_of_works
- risk_assessment
- method_statement
- ppe
- coshh
- emergency_procedures
- training_competency
- permits
- plant_tools_equipment
- site_specific_controls
- waste_management
- manual_handling
- working_at_height
- fire_safety
- first_aid

RAMS Document Text:
{ramsText}

Return a JSON object with the analysis.`;

export const COMPLIANCE_COMPARISON_PROMPT = `You are a construction compliance auditor. Compare each requirement against the RAMS document evidence.

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

export const EXPLANATION_PROMPT = `You are a construction compliance expert. Generate a clear, professional explanation of the RAMS review decision.

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

export const EMAIL_APPROVAL_PROMPT = `Generate a professional approval email for a RAMS submission.

Project: {projectName}
Subcontractor: {subcontractorName}
Compliance Score: {complianceScore}%
Threshold: {threshold}%

Summary: {summary}
Next Steps: The RAMS has been approved. Please ensure all controls are implemented on site.

Include the mandatory disclaimer: "This automated review is a compliance support tool. Final approval should be confirmed by a competent person before work starts."

Return JSON with subject and body.`;

export const EMAIL_REJECTION_PROMPT = `Generate a professional rejection email for a RAMS submission.

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

export const EMAIL_MANUAL_REVIEW_PROMPT = `Generate a professional email for a RAMS submission requiring manual review.

Project: {projectName}
Subcontractor: {subcontractorName}
Reason for Manual Review: {reason}

Include the mandatory disclaimer: "This automated review is a compliance support tool. Final approval should be confirmed by a competent person before work starts."

Do NOT say the RAMS is approved or rejected.

Return JSON with subject and body.`;
