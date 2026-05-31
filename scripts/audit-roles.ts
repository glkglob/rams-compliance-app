#!/usr/bin/env tsx
/**
 * audit-roles.ts
 *
 * Scans the source tree for role-check patterns and reports them.
 *
 * Usage:
 *   npx tsx scripts/audit-roles.ts
 *   npx tsx scripts/audit-roles.ts --json      # machine-readable output
 *
 * Exit codes:
 *   0 – scan complete (warnings are printed but do not fail)
 *   1 – fatal error (e.g. src directory not found)
 */

import { execSync } from "child_process";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "src");

const JSON_MODE = process.argv.includes("--json");

// ── Pattern catalogue ──────────────────────────────────────────────────────

interface Pattern {
  id: string;
  label: string;
  /** grep extended-regex (-E) */
  regex: string;
  /** true = preferred pattern, false = should be replaced */
  preferred: boolean;
}

const PATTERNS: Pattern[] = [
  // ❌  Raw literal admin checks
  {
    id: "literal-admin-eq",
    label: 'Raw === "admin" check',
    regex: '=== ?"admin"',
    preferred: false,
  },
  {
    id: "literal-admin-ne",
    label: 'Raw !== "admin" check',
    regex: '!== ?"admin"',
    preferred: false,
  },
  // ❌  Raw literal project_manager checks
  {
    id: "literal-pm",
    label: 'Raw "project_manager" role check',
    regex: '=== ?"project_manager"',
    preferred: false,
  },
  // ❌  Inline role-array includes (should use role constants)
  {
    id: "inline-includes",
    label: "Inline role array includes() check",
    regex: '\\["(admin|viewer|reviewer)"[, ]',
    preferred: false,
  },
  // ✅  Approved helpers
  {
    id: "isAdminRole",
    label: "isAdminRole() helper",
    regex: "isAdminRole\\(",
    preferred: true,
  },
  {
    id: "isProjectManagementRole",
    label: "isProjectManagementRole() helper",
    regex: "isProjectManagementRole\\(",
    preferred: true,
  },
  {
    id: "hasPermission",
    label: "hasPermission() helper",
    regex: "hasPermission\\(",
    preferred: true,
  },
  {
    id: "canManageProject",
    label: "canManageProject() permission check",
    regex: "canManageProject\\(",
    preferred: true,
  },
  {
    id: "OVERRIDE_ALLOWED_ROLES",
    label: "OVERRIDE_ALLOWED_ROLES constant",
    regex: "OVERRIDE_ALLOWED_ROLES",
    preferred: true,
  },
  {
    id: "PROJECT_MANAGEMENT_ROLES",
    label: "PROJECT_MANAGEMENT_ROLES constant",
    regex: "PROJECT_MANAGEMENT_ROLES",
    preferred: true,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

interface Hit {
  file: string;
  line: number;
  text: string;
  patternId: string;
}

function grep(pattern: string): Hit[] {
  try {
    const raw = execSync(
      `grep -rn --include="*.ts" --include="*.tsx" -E ${JSON.stringify(pattern)} ${JSON.stringify(SRC)}`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [fileLine, ...rest] = line.split(":");
        const [file, lineNo] = fileLine.split(/(?<=\d+\.tsx?):/) ?? [fileLine, "0"];
        // grep output: path:linenum:text
        const parts = line.match(/^(.+?):(\d+):(.*)$/);
        if (!parts) return null;
        return {
          file: parts[1].replace(ROOT + "/", ""),
          line: parseInt(parts[2], 10),
          text: parts[3].trim(),
          patternId: "",
        };
      })
      .filter((h): h is Hit => h !== null);
  } catch {
    // grep exits 1 when no matches — that's fine
    return [];
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

const results: Record<string, Hit[]> = {};

for (const pattern of PATTERNS) {
  const hits = grep(pattern.regex).map((h) => ({ ...h, patternId: pattern.id }));
  // Skip hits inside test files, the audit script itself, and the roles/permissions
  // definition files where the literals appear as the canonical implementation.
  results[pattern.id] = hits.filter(
    (h) =>
      !h.file.includes("__tests__") &&
      !h.file.includes("scripts/audit-roles") &&
      !h.file.endsWith("src/lib/auth/roles.ts") &&
      !h.file.endsWith("src/lib/auth/permissions.ts"),
  );
}

if (JSON_MODE) {
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  process.exit(0);
}

// ── Human-readable output ──────────────────────────────────────────────────

let warnings = 0;

for (const pattern of PATTERNS) {
  const hits = results[pattern.id];
  if (hits.length === 0) continue;

  const icon = pattern.preferred ? "✅" : "⚠️ ";
  console.log(`\n${icon} ${pattern.label} (${hits.length} hit${hits.length === 1 ? "" : "s"})`);

  for (const h of hits) {
    console.log(`   ${h.file}:${h.line}  →  ${h.text.slice(0, 120)}`);
    if (!pattern.preferred) warnings++;
  }
}

console.log("\n──────────────────────────────────────────────");
if (warnings === 0) {
  console.log("✅  No raw role-literal checks found. All checks use approved helpers.");
} else {
  console.log(
    `⚠️   ${warnings} raw role-literal check${warnings === 1 ? "" : "s"} found — consider replacing with helpers from @/lib/auth/roles or @/lib/auth/permissions.`,
  );
}
console.log("──────────────────────────────────────────────\n");
