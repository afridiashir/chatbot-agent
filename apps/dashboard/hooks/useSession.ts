"use client";

import { useCallback, useEffect, useState } from "react";
import type { Agent, LoginResult } from "@repo/types";
import { api, ApiError } from "@/lib/api";
import { clearToken, getToken, setToken } from "@/lib/session";

export interface Session {
  agent: Agent | null;
  token: string | null;
  /** True until the stored token has been checked against the server. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Applied locally after a status change so the header updates immediately. */
  setAgent: (agent: Agent) => void;
}

export function useSession(): Session {
  const [agent, setAgentState] = useState<Agent | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // A stored token may be expired or from a deleted agent, so it is always
  // revalidated rather than trusted.
  useEffect(() => {
    const stored = getToken("AGENT");
    if (!stored) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const me = await api<Agent>("/api/auth/me", { token: stored });
        if (cancelled) return;
        setAgentState(me);
        setTokenState(stored);
      } catch {
        clearToken("AGENT");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<LoginResult>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken("AGENT", result.token);
    setTokenState(result.token);
    setAgentState(result.agent);
  }, []);

  const logout = useCallback(() => {
    clearToken("AGENT");
    setTokenState(null);
    setAgentState(null);
  }, []);

  return { agent, token, loading, login, logout, setAgent: setAgentState };
}

export { ApiError };
