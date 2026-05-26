function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    // During Next.js static page prerendering at build time, env vars that are
    // injected at runtime (e.g. via Railway) are not available. Throwing here
    // would abort the build even though the vars will be present at runtime.
    // We detect this phase by checking for the NEXT_PHASE env var that Next.js
    // sets during `next build`, and return an empty string as a safe placeholder.
    // In development we still throw immediately so missing vars surface quickly.
    if (
      typeof process !== "undefined" &&
      process.env.NEXT_PHASE === "phase-production-build"
    ) {
      return "";
    }

    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseEnv() {
  return {
    supabaseUrl: getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}
