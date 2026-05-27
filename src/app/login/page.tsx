"use client";

import { useMemo, useState } from "react";
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

type AuthMode = "sign-in" | "sign-up";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setError(response.error.message);
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

  return (
    <div className="container mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader className="space-y-3">
          <CardTitle>RAMS Compliance Review</CardTitle>
          <CardDescription>
            Sign in to manage projects, upload documents, and review RAMS
            submissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <Button
              type="button"
              variant={mode === "sign-in" ? "default" : "ghost"}
              onClick={() => setMode("sign-in")}
            >
              Sign In
            </Button>
            <Button
              type="button"
              variant={mode === "sign-up" ? "default" : "ghost"}
              onClick={() => setMode("sign-up")}
            >
              Create Account
            </Button>
          </div>

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

            <Button className="w-full" disabled={loading} type="submit">
              {loading
                ? mode === "sign-in"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "sign-in"
                  ? "Sign In"
                  : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
