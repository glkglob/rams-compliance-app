import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Dev/ops helper scripts — not part of the shipped app.
    "scripts/**",
  ]),
  {
    rules: {
      // Pre-existing debt: a number of `any` usages across src need generated
      // Supabase types to eliminate properly. Kept visible as warnings so they
      // can be burned down incrementally without blocking CI.
      "@typescript-eslint/no-explicit-any": "warn",
      // Data-loading patterns (fetch-on-mount via useEffect) are intentional;
      // refactoring them risks behaviour changes for marginal gain.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
