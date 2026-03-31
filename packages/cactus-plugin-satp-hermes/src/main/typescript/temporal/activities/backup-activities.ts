import { X509Certificate } from "node:crypto";
import { ApplicationFailure, Context } from "@temporalio/activity";

/**
 * Options for {@link makeBackupActivities}.
 *
 * @property insecure - When `true`, certificate-chain validation is skipped
 *   and `validateCertChainActivity` always returns `true`.  Use **only** in
 *   local-testing environments — never in production.
 */
export interface IBackupActivitiesOptions {
  insecure?: boolean;
}

/**
 * Factory that returns backup-gateway activities.
 *
 * These activities support the Primary-Backup model defined in
 * draft-belchior-satp-gateway-recovery-04 §6.1:  before a backup gateway
 * takes over a crashed primary, it must prove its identity by presenting a
 * valid X.509 certificate chain where:
 *  - every certificate in the chain is unexpired at the current time, and
 *  - each certificate is issued (signed) by the next certificate in the chain.
 *
 * `validateCertChainActivity` runs as a Temporal Activity so its result is
 * durably recorded in the Temporal event history and automatically retried on
 * transient failure.
 *
 * Pass `{ insecure: true }` to disable certificate validation for local
 * testing.
 */
export function makeBackupActivities(options?: IBackupActivitiesOptions) {
  return {
    /**
     * draft §6.1 — validates the backup gateway's X.509 certificate chain.
     *
     * `certChainPem` must be a PEM-encoded certificate chain where the first
     * certificate is the leaf (backup gateway identity) and subsequent
     * certificates form the chain up to (but not necessarily including) the
     * root CA.
     *
     * Validation rules:
     *  1. At least one certificate must be present.
     *  2. Every certificate in the chain must not be expired at the current time.
     *  3. Each non-leaf certificate must have issued the preceding certificate
     *     (i.e., the leaf's issuer equals the next cert's subject, and so on).
     *
     * Returns `true` if the chain is valid, `false` otherwise.  Throws a
     * non-retryable `ApplicationFailure` only on parse errors.
     *
     * When the factory was created with `{ insecure: true }` this method
     * returns `true` immediately without inspecting the certificate chain.
     */
    async validateCertChainActivity(certChainPem: string): Promise<boolean> {
      Context.current().heartbeat({ op: "validateCertChain" });
      if (options?.insecure) {
        return true;
      }
      try {
        const certs = parseCertChain(certChainPem);
        if (certs.length === 0) {
          return false;
        }

        const now = new Date();

        for (const cert of certs) {
          const validFrom = new Date(cert.validFrom);
          const validTo = new Date(cert.validTo);
          if (now < validFrom || now > validTo) {
            return false;
          }
        }

        // Verify issuer chain: cert[i].issuer === cert[i+1].subject
        for (let i = 0; i < certs.length - 1; i++) {
          if (certs[i].issuer !== certs[i + 1].subject) {
            return false;
          }
        }

        return true;
      } catch (err) {
        if (err instanceof ApplicationFailure) throw err;
        // Certificate parse errors are non-retryable — the PEM is malformed.
        throw ApplicationFailure.create({
          message: `validateCertChainActivity: failed to parse certificate chain: ${String(err)}`,
          type: "CertChainParseError",
          nonRetryable: true,
        });
      }
    },
  };
}

/**
 * Parses a PEM-encoded certificate chain and returns an array of
 * `X509Certificate` objects.  Each `-----BEGIN CERTIFICATE-----` block is
 * treated as one certificate.
 */
function parseCertChain(certChainPem: string): X509Certificate[] {
  const pem = certChainPem.trim();
  const pemBlocks = pem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  );
  if (!pemBlocks) {
    return [];
  }
  return pemBlocks.map((block) => new X509Certificate(block));
}

export type BackupActivities = ReturnType<typeof makeBackupActivities>;
