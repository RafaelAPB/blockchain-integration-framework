/**
 * Validates the enableCrashRecovery configuration value.
 *
 * Crash recovery requires a running Temporal server.  When
 * {@link opts.configValue} is `true`, {@link opts.temporalAddress} must also
 * be provided — it is the address of the Temporal frontend gRPC endpoint
 * (e.g. `"temporal:7233"`).
 *
 * Setting {@link opts.configValue} to `true` without a Temporal address will
 * throw an error.
 */
export function validateSatpEnableCrashRecovery(opts: {
  readonly configValue: unknown;
  readonly temporalAddress?: string;
}): boolean {
  if (!opts || opts.configValue === undefined) {
    return false;
  }

  if (typeof opts.configValue !== "boolean") {
    throw new TypeError(
      `Invalid config.enableCrashRecovery: ${opts.configValue}. Expected a boolean`,
    );
  }

  if (opts.configValue === true) {
    if (!opts.temporalAddress) {
      throw new Error(
        "TEMPORAL_ADDRESS must be set when enableCrashRecovery is true. " +
          "Provide the Temporal frontend gRPC address (e.g. 'temporal:7233') " +
          "via the temporalAddress config field or the TEMPORAL_ADDRESS environment variable.",
      );
    }
  }

  return opts.configValue;
}
