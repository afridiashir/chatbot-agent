"use client";

import { useCallback, useEffect, useState } from "react";
import type { Admin, AdminLoginResult } from "@repo/types";
import { api, ApiError } from "@/lib/api";
import { clearToken, getToken, setToken } from "@/lib/session";

export interface AdminSession {
  admin: Admin | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

/** Mirrors useSession, but against the separate admin account and endpoints. */
export function useAdminSession(): AdminSession {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getToken("ADMIN");
    if (!stored) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const me = await api<Admin>("/api/admin/auth/me", { token: stored });
        if (cancelled) return;
        setAdmin(me);
        setTokenState(stored);
      } catch {
        clearToken("ADMIN");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<AdminLoginResult>("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken("ADMIN", result.token);
    setTokenState(result.token);
    setAdmin(result.admin);
  }, []);

  const logout = useCallback(() => {
    clearToken("ADMIN");
    setTokenState(null);
    setAdmin(null);
  }, []);

  return { admin, token, loading, login, logout };
}

export { ApiError };
