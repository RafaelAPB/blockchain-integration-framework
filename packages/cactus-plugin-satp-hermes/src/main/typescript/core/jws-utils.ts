/**
 * JWS (JSON Web Signature) utilities for SATP v13 message signing
 * and verification.
 *
 * v13 replaces per-message `clientSignature`/`serverSignature` fields
 * with JWS envelope signing per [RFC7515]. All outgoing SATP messages
 * MUST be wrapped in a JWS; all incoming messages MUST have their JWS
 * verified.
 *
 * **Current status**: STUB IMPLEMENTATION. All signing produces a
 * placeholder token and all verification returns `true`. This is
 * intentional to unblock the v02→v13 migration without introducing
 * a new production dependency (e.g., `jose`) or changing the
 * transport layer. The full implementation is tracked as a follow-up
 * to TASK-064.
 *
 * TODO(TASK-064-followup):
 *   - Add `jose` (or Node.js native `crypto`) dependency for real
 *     ECDSA P-256 / SHA-256 JWS operations.
 *   - Implement `jwsSign` using `CompactSign` from `jose`.
 *   - Implement `jwsVerify` using `compactVerify` from `jose`.
 *   - Wire into ConnectRPC transport middleware so signing/verification
 *     is transparent to service layer code.
 *   - Support `alg: "ES256"` as the REQUIRED algorithm per v13
 *     Section 5.3.3 and [RFC7518 Section 3.1].
 *
 * @module core/jws-utils
 * @see https://datatracker.ietf.org/doc/draft-ietf-satp-core/13/
 * @see https://www.rfc-editor.org/rfc/rfc7515 — JWS specification
 * @see https://www.rfc-editor.org/rfc/rfc7518#section-3.1 — JWA ES256
 */

import { stringify as safeStableStringify } from "safe-stable-stringify";
import * as nodeCrypto from "node:crypto";

/**
 * Supported JWS algorithms.
 *
 * v13 mandates ECDSA P-256 with SHA-256 (`ES256`) as the minimum.
 */
export enum JWSAlgorithm {
  /** ECDSA using P-256 and SHA-256 — REQUIRED by v13 */
  ES256 = "ES256",
}

/**
 * Result of a JWS verification operation.
 */
export interface IJWSVerificationResult {
  /** Whether the JWS signature is valid */
  verified: boolean;
  /** The decoded payload (raw bytes or string) */
  payload: string;
  /** Algorithm used in the JWS header */
  algorithm: JWSAlgorithm;
}

/**
 * Options for JWS signing.
 */
export interface IJWSSignOptions {
  /** The algorithm to use. Defaults to ES256. */
  algorithm?: JWSAlgorithm;
  /**
   * Private key for signing.
   *
   * When this is a `node:crypto` `KeyObject` of type `"private"` (EC P-256),
   * the JWS is signed using ECDSA P-256 with SHA-256 per RFC 7518 §3.4.
   * Otherwise, the stub signature `STUB_SIGNATURE` is used.
   */
  privateKey?: unknown;
}

/**
 * Options for JWS verification.
 */
export interface IJWSVerifyOptions {
  /** The expected algorithm. Defaults to ES256. */
  algorithm?: JWSAlgorithm;
  /**
   * Public key for verification.
   *
   * When this is a `node:crypto` `KeyObject` of type `"public"` (EC P-256),
   * ECDSA P-256 verification is performed. Otherwise, verification is
   * skipped and `verified: true` is returned (stub behaviour).
   */
  publicKey?: unknown;
}

/**
 * Produce a JWS Compact Serialization for the given SATP message.
 *
 * When `options.privateKey` is a `node:crypto` `KeyObject` of type
 * `"private"` (EC P-256), a real ECDSA P-256 / SHA-256 signature is
 * produced in IEEE P1363 format (64 bytes, base64url-encoded) as required
 * by RFC 7518 §3.4 for `ES256`.
 *
 * When no compatible private key is supplied (the default), the stub
 * signature `STUB_SIGNATURE` is used so that existing tests and development
 * workflows continue to work without key infrastructure.
 *
 * @param message - The SATP protobuf message object to sign
 * @param options - Signing options (algorithm, private key)
 * @returns A JWS Compact Serialization string
 *
 * @see https://www.rfc-editor.org/rfc/rfc7515 JWS specification
 * @see https://www.rfc-editor.org/rfc/rfc7518#section-3.4 ES256 algorithm
 */
export function jwsSign(message: unknown, options?: IJWSSignOptions): string {
  const alg = options?.algorithm ?? JWSAlgorithm.ES256;

  // JWS header: {"alg":"ES256","typ":"satp+jws"}
  const header = Buffer.from(JSON.stringify({ alg, typ: "satp+jws" })).toString(
    "base64url",
  );

  // Payload: canonical JSON of the message
  const payload = Buffer.from(safeStableStringify(message) ?? "").toString(
    "base64url",
  );

  // JWS signing input: ASCII(BASE64URL(header) || "." || BASE64URL(payload))
  const signingInput = `${header}.${payload}`;

  // Real ECDSA P-256 signing when a compatible private key is supplied.
  if (
    options?.privateKey instanceof nodeCrypto.KeyObject &&
    options.privateKey.type === "private"
  ) {
    const sign = nodeCrypto.createSign("SHA256");
    sign.update(signingInput, "ascii");
    // ieee-p1363 produces the 64-byte (r||s) format required by ES256
    const sig = sign.sign({
      key: options.privateKey,
      dsaEncoding: "ieee-p1363",
    });
    return `${signingInput}.${sig.toString("base64url")}`;
  }

  // Stub fallback — no key supplied (development / test mode).
  const signature = "STUB_SIGNATURE";
  return `${signingInput}.${signature}`;
}

/**
 * Verify a JWS Compact Serialization and extract the payload.
 *
 * When `options.publicKey` is a `node:crypto` `KeyObject` of type `"public"`
 * (EC P-256), ECDSA P-256 / SHA-256 signature verification is performed
 * using the IEEE P1363 signature format required by ES256.
 *
 * When no compatible public key is supplied, verification is skipped and
 * `{ verified: true }` is returned (stub behaviour) so that development
 * and test workflows continue without key infrastructure.
 *
 * @param jws - The JWS Compact Serialization string to verify
 * @param options - Verification options (algorithm, public key)
 * @returns Verification result with decoded payload
 *
 * @see https://www.rfc-editor.org/rfc/rfc7515 JWS specification
 */
export function jwsVerify(
  jws: string,
  options?: IJWSVerifyOptions,
): IJWSVerificationResult {
  const alg = options?.algorithm ?? JWSAlgorithm.ES256;

  const parts = jws.split(".");
  if (parts.length !== 3) {
    return { verified: false, payload: "", algorithm: alg };
  }

  const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
  const signingInput = `${parts[0]}.${parts[1]}`;

  // Real ECDSA P-256 verification when a compatible public key is supplied.
  if (
    options?.publicKey instanceof nodeCrypto.KeyObject &&
    options.publicKey.type === "public"
  ) {
    try {
      const verify = nodeCrypto.createVerify("SHA256");
      verify.update(signingInput, "ascii");
      const valid = verify.verify(
        { key: options.publicKey, dsaEncoding: "ieee-p1363" },
        parts[2],
        "base64url",
      );
      return { verified: valid, payload: valid ? payload : "", algorithm: alg };
    } catch {
      return { verified: false, payload: "", algorithm: alg };
    }
  }

  // Stub fallback: skip verification (development / test mode).
  return {
    verified: true,
    payload,
    algorithm: alg,
  };
}

/**
 * Extract and decode the payload from a JWS without verification.
 *
 * Useful for logging or debugging. Do NOT use for security decisions.
 *
 * @param jws - The JWS Compact Serialization string
 * @returns The decoded payload string, or empty string if malformed
 */
export function jwsDecodePayload(jws: string): string {
  const parts = jws.split(".");
  if (parts.length !== 3) {
    return "";
  }
  return Buffer.from(parts[1], "base64url").toString("utf-8");
}
