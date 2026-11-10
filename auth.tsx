import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ApiError,
  getCurrentUser,
  logoutCurrentSession,
  updateCurrentUser,
  type AuthUser,
} from "./api";
import { useStore } from "./store";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  sessionExpired: boolean;
  setAuthenticatedUser: (user: AuthUser) => void;
  updateProfile: (changes: { display_name?: string; email?: string | null }) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function displayPhone(phone: string) {
  const digits = phone.replace(/^\+91/, "");
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

function memberSince(createdAt: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(createdAt));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const { setUser: setLegacyUser } = useStore();

  const syncUser = useCallback((next: AuthUser) => {
    setUser(next);
    setSessionExpired(false);
    setLegacyUser({
      name: next.display_name,
      phone: displayPhone(next.phone),
      email: next.email ?? "",
      since: memberSince(next.created_at),
    });
  }, [setLegacyUser]);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((next) => { if (active) syncUser(next); })
      .catch((error: unknown) => {
        if (!active) return;
        setUser(null);
        setSessionExpired(error instanceof ApiError && error.code === "session_expired");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [syncUser]);

  const updateProfile = useCallback(async (changes: { display_name?: string; email?: string | null }) => {
    const next = await updateCurrentUser(changes);
    syncUser(next);
    return next;
  }, [syncUser]);

  const logout = useCallback(async () => {
    try { await logoutCurrentSession(); } finally {
      setUser(null);
      setSessionExpired(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    sessionExpired,
    setAuthenticatedUser: syncUser,
    updateProfile,
    logout,
  }), [user, loading, sessionExpired, syncUser, updateProfile, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth outside AuthProvider");
  return context;
}
