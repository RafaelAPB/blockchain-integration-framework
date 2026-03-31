/**
 * Unit tests for validateSatpEnableCrashRecovery — Temporal address guard.
 *
 * Verifies the behaviour introduced in T20: crash recovery requires a Temporal
 * address when enabled, and the error message must reference "TEMPORAL_ADDRESS".
 */
import "jest-extended";
import { validateSatpEnableCrashRecovery } from "../../../../main/typescript/services/validation/config-validating-functions/validate-satp-enable-crash-recovery";

describe("validateSatpEnableCrashRecovery — Temporal guard", () => {
  it("returns false when configValue is undefined", () => {
    const result = validateSatpEnableCrashRecovery({
      configValue: undefined,
    });
    expect(result).toBe(false);
  });

  it("returns false when opts object is empty (no configValue key)", () => {
    // opts.configValue will be undefined
    const result = validateSatpEnableCrashRecovery(
      {} as Parameters<typeof validateSatpEnableCrashRecovery>[0],
    );
    expect(result).toBe(false);
  });

  it("throws TypeError when configValue is not a boolean", () => {
    expect(() =>
      validateSatpEnableCrashRecovery({ configValue: "yes" }),
    ).toThrow(TypeError);
  });

  it("throws TypeError with descriptive message when configValue is a number", () => {
    expect(() =>
      validateSatpEnableCrashRecovery({ configValue: 1 }),
    ).toThrowError(/Expected a boolean/);
  });

  it("throws Error when configValue is true and temporalAddress is not set", () => {
    expect(() =>
      validateSatpEnableCrashRecovery({ configValue: true }),
    ).toThrow(Error);
  });

  it("error message contains 'TEMPORAL_ADDRESS' when temporalAddress is missing", () => {
    expect(() =>
      validateSatpEnableCrashRecovery({ configValue: true }),
    ).toThrowError(/TEMPORAL_ADDRESS/);
  });

  it("returns true when configValue is true and temporalAddress is provided", () => {
    const result = validateSatpEnableCrashRecovery({
      configValue: true,
      temporalAddress: "temporal:7233",
    });
    expect(result).toBe(true);
  });

  it("returns false when configValue is false (temporalAddress not required)", () => {
    const result = validateSatpEnableCrashRecovery({
      configValue: false,
    });
    expect(result).toBe(false);
  });

  it("returns false when configValue is false even if temporalAddress is provided", () => {
    const result = validateSatpEnableCrashRecovery({
      configValue: false,
      temporalAddress: "temporal:7233",
    });
    expect(result).toBe(false);
  });

  it("throws Error when configValue is true and temporalAddress is an empty string", () => {
    expect(() =>
      validateSatpEnableCrashRecovery({
        configValue: true,
        temporalAddress: "",
      }),
    ).toThrow(Error);
  });
});
