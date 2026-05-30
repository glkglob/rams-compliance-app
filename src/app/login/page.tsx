"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Force dynamic rendering. This page (and its layout tree) requires runtime
// Supabase credentials and must never be statically prerendered at build time
// (when env vars are absent in the Docker/Railway build environment).
export const dynamic = 'force-dynamic';

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/db/supabase-client";

type AuthMode = "sign-in" | "sign-up" | "reset-password";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [checkingSession, setCheckingSession] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Computed during render so we don't setState inside an effect.
  const [message, setMessage] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("reset") === "success"
      ? "Password reset successful. Please sign in with your new password."
      : null;
  });
  const [resetCooldown, setResetCooldown] = useState(0);

  // Password strength calculator (only used in sign-up)
  const passwordStrength = useMemo(() => {
    if (!password) return 0;
    let score = 0;

    if (password.length >= 6) score += 1;
    if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    return Math.min(score, 4); // 0-4
  }, [password]);

  const strengthLabels = ["Weak", "Fair", "Good", "Strong", "Excellent"];
  const strengthColors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-green-500",
    "bg-emerald-500",
  ];

  // Improved error message mapping
  function getFriendlyErrorMessage(error: unknown): string {
    const errMessage =
      (error as { message?: string } | null)?.message ||
      "Something went wrong. Please try again.";
    const message = errMessage;

    if (message.includes("Invalid login credentials")) {
      return "Incorrect email or password. Please try again.";
    }
    if (message.includes("Email not confirmed")) {
      return "Please confirm your email address before signing in.";
    }
    if (message.includes("User already registered")) {
      return "An account with this email already exists. Try signing in instead.";
    }
    if (message.includes("Password should be at least")) {
      return "Password must be at least 6 characters long.";
    }
    if (message.includes("Unable to validate email address")) {
      return "Please enter a valid email address.";
    }

    return message;
  }

  // Redirect away if user is already authenticated
  useEffect(() => {
    const checkSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.push("/dashboard");
      } else {
        setCheckingSession(false);
      }
    };
    checkSession();
  }, [supabase, router]);

  // Show success message if coming from password reset.
  // Computed during render via useState initializer so we don't call setState
  // inside an effect (satisfies react-hooks/set-state-in-effect). The URL
  // cleanup still happens in an effect because router.replace is a side effect.
  useEffect(() => {
    if (message && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("reset") === "success") {
        router.replace("/login", { scroll: false });
      }
    }
  }, [message, router]);

  function validateForm(): string | null {
    if (!email || !password) {
      return "Please fill in all required fields.";
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return "Please enter a valid email address.";
    }

    if (password.length < 6) {
      return "Password must be at least 6 characters long.";
    }

    if (mode === "sign-up" && !fullName.trim()) {
      return "Please enter your full name.";
    }

    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    const response =
      mode === "sign-up"
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                role: "viewer",
              },
            },
          })
        : await supabase.auth.signInWithPassword({
            email,
            password,
          });

    if (response.error) {
      setError(getFriendlyErrorMessage(response.error));
      setLoading(false);
      return;
    }

    if (mode === "sign-up" && !response.data.session) {
      setMessage("Account created. Check your email to confirm your account.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!resetEmail) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(getFriendlyErrorMessage(error));
    } else {
      setMessage("If an account exists for this email, you will receive a password reset link shortly.");
      // Start 60s cooldown
      setResetCooldown(60);
      const interval = setInterval(() => {
        setResetCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    setLoading(false);
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader className="space-y-3">
          <CardTitle>RAMS Compliance Review</CardTitle>
          <CardDescription>
            {mode === "sign-in"
              ? "Sign in to manage projects, upload documents, and review RAMS submissions."
              : "Create an account to get started with RAMS compliance reviews."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <Button
              type="button"
              variant={mode === "sign-in" ? "default" : "ghost"}
              onClick={() => setMode("sign-in")}
            >
              Sign in
            </Button>
            <Button
              type="button"
              variant={mode === "sign-up" ? "default" : "ghost"}
              onClick={() => setMode("sign-up")}
            >
              Sign up
            </Button>
          </div>

          {/* Sign In / Sign Up Form */}
          {(mode === "sign-in" || mode === "sign-up") && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              {mode === "sign-up" && (
                <div className="space-y-2">
                  <Label htmlFor="full-name">Full name</Label>
                  <Input
                    id="full-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Jane Doe"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={6}
                  placeholder="Enter your password"
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                  required
                />

                {/* Password strength indicator - only shown during sign up */}
                {mode === "sign-up" && password.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="flex h-1.5 w-full gap-1 rounded-full bg-muted overflow-hidden">
                      {[0, 1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className={`flex-1 rounded-full transition-all ${
                            level < passwordStrength
                              ? strengthColors[Math.min(passwordStrength - 1, 4)]
                              : "bg-muted-foreground/20"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Strength: <span className="font-medium">{strengthLabels[passwordStrength]}</span>
                    </p>
                  </div>
                )}

                {/* Forgot password link - only in sign-in mode */}
                {mode === "sign-in" && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setMode("reset-password")}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Forgot your password?
                    </button>
                  </div>
                )}
              </div>

              {error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {message ? (
                <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
                  {message}
                </div>
              ) : null}

              <Button className="w-full" disabled={loading} type="submit">
                {loading
                  ? mode === "sign-in"
                    ? "Signing in..."
                    : "Signing up..."
                  : mode === "sign-in"
                    ? "Sign in"
                    : "Sign up"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {mode === "sign-in" ? (
                  <>
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("sign-up")}
                      className="font-medium text-foreground hover:underline"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("sign-in")}
                      className="font-medium text-foreground hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </form>
          )}

          {/* Password Reset Form */}
          {mode === "reset-password" && (
            <form className="space-y-4" onSubmit={handleResetPassword}>
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email Address</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>

              {error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {message ? (
                <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
                  {message}
                </div>
              ) : null}

              <Button 
                className="w-full" 
                disabled={loading || resetCooldown > 0} 
                type="submit"
              >
                {loading 
                  ? "Sending reset link..." 
                  : resetCooldown > 0 
                    ? `Resend in ${resetCooldown}s` 
                    : "Send password reset link"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Remember your password?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("sign-in");
                    setError(null);
                    setMessage(null);
                  }}
                  className="font-medium text-foreground hover:underline"
                >
                  Back to sign in
                </button>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
