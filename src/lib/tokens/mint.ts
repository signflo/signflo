import "server-only";
import { randomBytes } from "node:crypto";

/**
 * Generate a URL-safe bearer token (~192 bits of entropy).
 *
 * 24 random bytes → 32-char base64url string with no padding. Sufficient
 * entropy to make brute-force infeasible and short enough to fit in a QR
 * code or text message comfortably. Same strength profile as DocuSign
 * envelope links, Calendly booking URLs, unlisted Google Docs.
 */
export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}
