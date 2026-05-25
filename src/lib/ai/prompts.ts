export const REQUIREMENT_EXTRACTION_PROMPT = `You are a construction compliance expert. Extract mandatory compliance requirements from the provided document.

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
