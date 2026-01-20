/**
 * Gateway Authentication
 *
 * JWT verification for sandbox → cloud calls.
 */

import * as jose from "jose";

/**
 * Token payload structure from sandbox JWT.
 */
export interface TokenPayload {
  projectId?: string;
  sessionId?: string;
  userId?: string;
  workspaceId?: string;
  brandId?: string;
  orgId?: string;
}

/**
 * Verify JWT token from request Authorization header.
 *
 * @param request - HTTP request with Authorization header
 * @param secret - JWT secret (from env SANDBOX_JWT_SECRET)
 * @returns Token payload if valid, null otherwise
 */
export async function verifyToken(
  request: Request,
  secret: string | undefined
): Promise<TokenPayload | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.split(" ")[1];
  if (!secret) return null;

  try {
    const { payload } = await jose.jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Create a JWT for sandbox authentication.
 *
 * @param payload - Token payload
 * @param secret - JWT secret
 * @param expiresIn - Token expiration (default: 24h)
 */
export async function createToken(
  payload: TokenPayload,
  secret: string,
  expiresIn = "24h"
): Promise<string> {
  return new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(new TextEncoder().encode(secret));
}
