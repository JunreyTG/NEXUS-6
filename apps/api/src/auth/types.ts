export type AuthRole = "SUPER_ADMIN" | "ADMIN";

export type AuthenticatedPrincipal = {
  type: AuthRole;
  id: string | null;
  email: string;
  name?: string | undefined;
  role: AuthRole;
  sessionId?: string | undefined;
};

export type SafeUser = Pick<AuthenticatedPrincipal, "email" | "role"> & {
  name?: string | undefined;
};

declare global {
  // Express request augmentation is required for authenticated middleware.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: AuthenticatedPrincipal;
    }
  }
}

export {};
