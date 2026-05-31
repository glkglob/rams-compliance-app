import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the underlying helper so we test the wrapper in isolation.
vi.mock("@/lib/auth/ensure-profile", () => ({
  ensureProfile: vi.fn(),
}));

import { ensureProfile as _ensureProfile } from "@/lib/auth/ensure-profile";
import { ensureProfile } from "@/lib/profiles/ensure-profile";
import type { SupabaseClient, User } from "@supabase/supabase-js";

const mockUser = (overrides: Partial<User> = {}): User =>
  ({
    id: "user-123",
    email: "test@example.com",
    user_metadata: { full_name: "Test User" },
    ...overrides,
  }) as unknown as User;

const mockSupabase = {} as SupabaseClient;

describe("ensureProfile (profiles wrapper)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the profile when the underlying helper succeeds", async () => {
    const profile = { id: "user-123", email: "test@example.com", full_name: "Test User", role: "viewer" as const };
    vi.mocked(_ensureProfile).mockResolvedValueOnce(profile);

    const result = await ensureProfile({ user: mockUser(), supabase: mockSupabase });

    expect(result).toEqual(profile);
    expect(_ensureProfile).toHaveBeenCalledWith(
      "user-123",
      "test@example.com",
      "Test User",
    );
  });

  it("passes undefined full_name when user_metadata is absent", async () => {
    vi.mocked(_ensureProfile).mockResolvedValueOnce(null);
    const user = mockUser({ user_metadata: {} });

    await ensureProfile({ user, supabase: mockSupabase });

    expect(_ensureProfile).toHaveBeenCalledWith("user-123", "test@example.com", undefined);
  });

  it("passes undefined email when user has no email", async () => {
    vi.mocked(_ensureProfile).mockResolvedValueOnce(null);
    const user = mockUser({ email: undefined });

    await ensureProfile({ user, supabase: mockSupabase });

    expect(_ensureProfile).toHaveBeenCalledWith("user-123", undefined, "Test User");
  });

  it("returns null when the underlying helper returns null", async () => {
    vi.mocked(_ensureProfile).mockResolvedValueOnce(null);

    const result = await ensureProfile({ user: mockUser(), supabase: mockSupabase });

    expect(result).toBeNull();
  });
});
