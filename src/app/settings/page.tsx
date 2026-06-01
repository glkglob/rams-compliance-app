'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/db/supabase-client';
import { ROLE_DISPLAY_NAMES, type UserRole } from '@/lib/auth/roles';

// Force dynamic rendering — requires runtime auth + Supabase.
export const dynamic = 'force-dynamic';
import { AlertTriangle, ArrowLeft, Trash2, User } from 'lucide-react';
import { CertificationsCard } from '@/components/certifications/certifications-card';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface UserProfile {
  email: string;
  full_name: string | null;
  role: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Confirmation state for dangerous action
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        const supabase = createClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          router.push('/login');
          return;
        }

        // Fetch additional profile details (role, full_name) if available.
        // The email from auth.getUser() is the source of truth for the authenticated user.
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, role, email')
          .eq('id', user.id)
          .single();

        setProfile({
          email: user.email || profileData?.email || '—',
          full_name: profileData?.full_name ?? null,
          // Use the stored role; fall back to 'viewer' (the DB default) only if
          // the profile row exists but role is somehow null. The backfill migration
          // ensures all authenticated users have a profile row.
          role: profileData?.role ?? 'viewer',
        });
      } catch {
        // Non-fatal; show fallback
        setProfile({
          email: '—',
          full_name: null,
          role: 'viewer',
        });
      } finally {
        setLoading(false);
      }
    }
    void loadProfile();
  }, [router]);

  const handleDeleteAccount = async () => {
    if (!deleteConfirmed || deleteText !== 'DELETE MY ACCOUNT') {
      setError('You must type "DELETE MY ACCOUNT" exactly and tick the confirmation box.');
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.message || 'Deletion failed');
        setDeleting(false);
        return;
      }

      setSuccess(
        'Your account and associated data have been permanently deleted. You will now be signed out.'
      );

      // Force sign out and redirect to home after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 2500);
    } catch {
      setError('An unexpected error occurred while deleting your account.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-b-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-6 py-8">
      <Button variant="ghost" onClick={() => router.back()} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your profile and data preferences.
        </p>
      </div>

      {/* Profile section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Your Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">Email:</span>{' '}
            <span className="font-medium">{profile?.email ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Role:</span>{' '}
            <span className="font-medium">
              {profile?.role
                ? (ROLE_DISPLAY_NAMES[profile.role as UserRole] ?? profile.role)
                : '—'}
            </span>
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            Profile editing will be available in a future update. Contact your administrator to change roles.
          </p>
        </CardContent>
      </Card>

      {/* Certifications */}
      <div className="mb-8">
        <CertificationsCard />
      </div>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Actions in this section are permanent and cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">Delete your account and all personal data</div>
              <p className="text-sm text-muted-foreground mt-1 max-w-prose">
                This will permanently delete your profile, remove you from all projects, delete all
                projects you created (including every compliance document and RAMS within them), and
                delete all RAMS submissions you made. Some records may be retained for legal health &amp;
                safety reasons — see our{' '}
                <a href="/privacy" className="underline" target="_blank" rel="noreferrer">
                  Privacy Policy
                </a>
                .
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteModal(true)}
              className="shrink-0"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Deletion confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              <h2 className="text-xl font-semibold">Permanently delete your account?</h2>
            </div>

            <div className="space-y-4 text-sm">
              <p className="font-medium text-destructive">
                This action is irreversible. All of the following will be deleted:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Your user profile and authentication account</li>
                <li>Every project you created and 100% of the data inside (documents, RAMS, reviews, emails)</li>
                <li>All RAMS submissions you made to any project</li>
                <li>Your memberships in other projects</li>
                <li>Audit logs created by you</li>
                <li>All files you uploaded from Supabase Storage</li>
              </ul>

              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                Project owners on other projects may lose RAMS submissions you previously made. Records
                required by UK health &amp; safety law may be retained in anonymised or minimised form.
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-2">
                  <input
                    id="confirm-checkbox"
                    type="checkbox"
                    checked={deleteConfirmed}
                    onChange={(e) => setDeleteConfirmed(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-destructive"
                  />
                  <Label htmlFor="confirm-checkbox" className="text-sm leading-snug">
                    I understand that this will permanently delete my account and all associated data
                    as described above.
                  </Label>
                </div>

                <div>
                  <Label htmlFor="delete-text" className="text-xs font-medium">
                    Type <span className="font-mono font-semibold">DELETE MY ACCOUNT</span> to confirm
                  </Label>
                  <Input
                    id="delete-text"
                    value={deleteText}
                    onChange={(e) => setDeleteText(e.target.value)}
                    placeholder="DELETE MY ACCOUNT"
                    className="mt-1 font-mono"
                    disabled={!deleteConfirmed}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmed(false);
                  setDeleteText('');
                  setError(null);
                }}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deleting || !deleteConfirmed || deleteText !== 'DELETE MY ACCOUNT'}
              >
                {deleting ? 'Deleting everything…' : 'Permanently Delete My Account'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {success}
        </div>
      )}
    </div>
  );
}
