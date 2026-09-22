import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, login as loginRequest, logout as logoutRequest, refreshSession, type AuthUser } from "./api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  accessToken: string | null;
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let active = true;
    refreshSession()
      .then((session) => {
        if (!active) return;
        setAccessToken(session.accessToken);
        setUser(session.user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (active) setStatus("unauthenticated");
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      user,
      status,
      async login(email, password) {
        const session = await loginRequest(email, password);
        setAccessToken(session.accessToken);
        setUser(session.user);
        setStatus("authenticated");
      },
      async logout() {
        try {
          await logoutRequest();
        } finally {
          setAccessToken(null);
          setUser(null);
          setStatus("unauthenticated");
        }
      }
    }),
    [accessToken, status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) return "Authentication is temporarily unavailable.";
  return "Invalid email or password.";
}
