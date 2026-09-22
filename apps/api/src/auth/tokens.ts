import { jwtVerify, SignJWT } from "jose";
import type { AuthConfig } from "./config.js";
import { AuthenticationError } from "./errors.js";
import type { AuthenticatedPrincipal } from "./types.js";

const TOKEN_ISSUER = "nexus-6-api";
const TOKEN_ALGORITHM = "HS256";

function secretBytes(config: AuthConfig): Uint8Array {
  return new TextEncoder().encode(config.ACCESS_TOKEN_SECRET);
}

export async function issueAccessToken(
  principal: AuthenticatedPrincipal,
  sessionId: string,
  config: AuthConfig
): Promise<string> {
  return new SignJWT({
    type: principal.type,
    role: principal.role,
    email: principal.email
  })
    .setProtectedHeader({ alg: TOKEN_ALGORITHM, typ: "JWT" })
    .setIssuer(TOKEN_ISSUER)
    .setSubject(principal.id ?? "super-admin")
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime(config.ACCESS_TOKEN_EXPIRES_IN)
    .sign(secretBytes(config));
}

export async function verifyAccessToken(token: string, config: AuthConfig): Promise<AuthenticatedPrincipal> {
  try {
    const { payload } = await jwtVerify(token, secretBytes(config), {
      algorithms: [TOKEN_ALGORITHM],
      issuer: TOKEN_ISSUER
    });
    const role = payload.role;
    const email = payload.email;
    const type = payload.type;
    if (
      (role !== "SUPER_ADMIN" && role !== "ADMIN") ||
      type !== role ||
      typeof email !== "string" ||
      typeof payload.sub !== "string"
    ) {
      throw new AuthenticationError();
    }

    return {
      type: role,
      id: role === "SUPER_ADMIN" ? null : payload.sub,
      email,
      role
    };
  } catch {
    throw new AuthenticationError();
  }
}
