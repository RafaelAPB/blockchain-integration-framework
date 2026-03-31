import "jest-extended";
import { validateSatpEnableCrashRecovery } from "../../../../main/typescript/services/validation/config-validating-functions/validate-satp-enable-crash-recovery";

describe("validateSatpEnableCrashRecovery", () => {
  it("should throw when flag is true without temporalAddress", () => {
    expect(() =>
      validateSatpEnableCrashRecovery({
        configValue: true,
      }),
    ).toThrowError(
      "TEMPORAL_ADDRESS must be set when enableCrashRecovery is true",
    );
  });

  it("should pass when flag is false", () => {
    const result = validateSatpEnableCrashRecovery({
      configValue: false,
    });
    expect(result).toEqual(false);
  });

  it("should throw when flag is a string", () => {
    expect(() =>
      validateSatpEnableCrashRecovery({
        configValue: "true",
      }),
    ).toThrowError(
      `Invalid config.enableCrashRecovery: ${"true"}. Expected a boolean`,
    );
  });

  it("should throw when flag is a number", () => {
    expect(() =>
      validateSatpEnableCrashRecovery({
        configValue: 1,
      }),
    ).toThrowError(
      `Invalid config.enableCrashRecovery: ${1}. Expected a boolean`,
    );
  });

  it("should throw when flag is null", () => {
    expect(() =>
      validateSatpEnableCrashRecovery({
        configValue: null,
      }),
    ).toThrowError(
      `Invalid config.enableCrashRecovery: ${null}. Expected a boolean`,
    );
  });

  it("should throw when flag is undefined", () => {
    const result = validateSatpEnableCrashRecovery({
      configValue: undefined,
    });
    expect(result).toBeFalsy();
  });

  it("should throw when flag is an object", () => {
    expect(() =>
      validateSatpEnableCrashRecovery({
        configValue: {},
      }),
    ).toThrowError(
      `Invalid config.enableCrashRecovery: [object Object]. Expected a boolean`,
    );
  });
});

describe("validateSatpEnableCrashRecovery — Temporal enabled", () => {
  it("passes when flag is true AND temporalAddress is provided", () => {
    const result = validateSatpEnableCrashRecovery({
      configValue: true,
      temporalAddress: "temporal:7233",
    });
    expect(result).toBe(true);
  });

  it("throws when flag is true but temporalAddress is an empty string", () => {
    expect(() =>
      validateSatpEnableCrashRecovery({
        configValue: true,
        temporalAddress: "",
      }),
    ).toThrowError(
      "TEMPORAL_ADDRESS must be set when enableCrashRecovery is true",
    );
  });

  it("passes when flag is false and no temporalAddress", () => {
    const result = validateSatpEnableCrashRecovery({
      configValue: false,
    });
    expect(result).toBe(false);
  });
});
