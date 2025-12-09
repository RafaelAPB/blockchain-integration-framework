import { describe, expect, it } from "@jest/globals";
import { validateAdapterConfig } from "../../../../main/typescript/services/validation/config-validating-functions/validate-adapter-config";
import type { AdapterLayerConfiguration } from "../../../../main/typescript/adapters/api3-adapter-types";

describe("validateAdapterConfig - comprehensive validation scenarios", () => {
  describe("valid configurations", () => {
    it("validates minimal valid configuration", () => {
      const config: AdapterLayerConfiguration = {
        satpStages: {
          stage1: {
            adapters: [
              {
                id: "test-adapter",
                name: "Test Adapter",
                active: true,
                outboundWebhook: {
                  url: "https://example.com/webhook",
                },
              },
            ],
          },
        },
      };

      const result = validateAdapterConfig({ configValue: config });

      expect(result).toBe(config);
    });

    it("validates configuration with all stage types", () => {
      const config: AdapterLayerConfiguration = {
        satpStages: {
          stage0: {
            adapters: [
              {
                id: "s0-adapter",
                name: "Stage 0",
                active: true,
                outboundWebhook: { url: "https://example.com/s0" },
              },
            ],
          },
          stage1: {
            adapters: [
              {
                id: "s1-adapter",
                name: "Stage 1",
                active: false,
                inboundWebhook: { urlSuffix: "/s1" },
              },
            ],
          },
          stage2: {
            adapters: [
              {
                id: "s2-adapter",
                name: "Stage 2",
                active: true,
                outboundWebhook: { url: "https://example.com/s2" },
              },
            ],
          },
          stage3: {
            adapters: [
              {
                id: "s3-adapter",
                name: "Stage 3",
                active: true,
                inboundWebhook: { urlSuffix: "/s3" },
              },
            ],
          },
          crash: {
            adapters: [
              {
                id: "crash-adapter",
                name: "Crash Recovery",
                active: true,
                outboundWebhook: { url: "https://example.com/crash" },
              },
            ],
          },
        },
      };

      const result = validateAdapterConfig({ configValue: config });

      expect(result).toBe(config);
    });

    it("validates configuration with step mappings", () => {
      const config: AdapterLayerConfiguration = {
        satpStages: {
          stage1: {
            adapters: [
              {
                id: "before-adapter",
                name: "Before",
                active: true,
                outboundWebhook: { url: "https://example.com/before" },
              },
              {
                id: "after-adapter",
                name: "After",
                active: true,
                outboundWebhook: { url: "https://example.com/after" },
              },
            ],
            steps: {
              before: ["before-adapter"],
              after: ["after-adapter"],
            },
          },
        },
      };

      const result = validateAdapterConfig({ configValue: config });

      expect(result).toBe(config);
    });

    it("validates configuration with all step types", () => {
      const config: AdapterLayerConfiguration = {
        satpStages: {
          stage2: {
            adapters: [
              { id: "a1", name: "A1", active: true, outboundWebhook: { url: "https://e.com/1" } },
              { id: "a2", name: "A2", active: true, outboundWebhook: { url: "https://e.com/2" } },
              { id: "a3", name: "A3", active: true, outboundWebhook: { url: "https://e.com/3" } },
              { id: "a4", name: "A4", active: true, outboundWebhook: { url: "https://e.com/4" } },
            ],
            steps: {
              before: ["a1"],
              during: ["a2"],
              after: ["a3"],
              rollback: ["a4"],
            },
          },
        },
      };

      const result = validateAdapterConfig({ configValue: config });

      expect(result).toBe(config);
    });

    it("validates configuration with both webhook types", () => {
      const config: AdapterLayerConfiguration = {
        satpStages: {
          stage1: {
            adapters: [
              {
                id: "dual-webhook",
                name: "Dual Webhook",
                active: true,
                outboundWebhook: { url: "https://example.com/out" },
                inboundWebhook: { urlSuffix: "/in" },
              },
            ],
          },
        },
      };

      const result = validateAdapterConfig({ configValue: config });

      expect(result).toBe(config);
    });

    it("validates configuration with optional fields", () => {
      const config: AdapterLayerConfiguration = {
        satpStages: {
          stage1: {
            adapters: [
              {
                id: "full-adapter",
                name: "Full Adapter",
                description: "Complete adapter configuration",
                active: true,
                priority: 100,
                outboundWebhook: {
                  url: "https://example.com/webhook",
                  method: "POST",
                  timeoutMs: 5000,
                  retryAttempts: 5,
                  retryDelayMs: 1000,
                  headers: { "X-Custom": "value" },
                },
              },
            ],
          },
        },
      };

      const result = validateAdapterConfig({ configValue: config });

      expect(result).toBe(config);
    });

    it("returns undefined when config is not provided", () => {
      const result = validateAdapterConfig({ configValue: undefined });

      expect(result).toBeUndefined();
    });
  });

  describe("invalid configurations - structure", () => {
    it("rejects null configuration", () => {
      expect(() => {
        validateAdapterConfig({ configValue: null as any });
      }).toThrow("Adapter configuration must be an object when provided");
    });

    it("rejects non-object configuration", () => {
      expect(() => {
        validateAdapterConfig({ configValue: "not an object" as any });
      }).toThrow("Adapter configuration must be an object when provided");
    });

    it("rejects configuration without satpStages", () => {
      expect(() => {
        validateAdapterConfig({ configValue: {} as any });
      }).toThrow("Adapter configuration must contain 'satpStages' object");
    });

    it("rejects configuration with null satpStages", () => {
      expect(() => {
        validateAdapterConfig({ configValue: { satpStages: null } as any });
      }).toThrow("Adapter configuration must contain 'satpStages' object");
    });

    it("rejects invalid stage key", () => {
      const config = {
        satpStages: {
          invalidStage: {
            adapters: [{ id: "test", name: "Test", active: true }],
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Invalid stage key \"invalidStage\"");
    });

    it("rejects stage without adapters array", () => {
      const config = {
        satpStages: {
          stage1: {},
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Stage \"stage1\" must contain 'adapters' array");
    });

    it("rejects stage with non-array adapters", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: "not an array",
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Stage \"stage1\" must contain 'adapters' array");
    });
  });

  describe("invalid configurations - adapter fields", () => {
    it("rejects adapter without id", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [{ name: "Test", active: true }],
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Adapter in stage \"stage1\" must have a valid 'id' string");
    });

    it("rejects adapter with non-string id", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [{ id: 123, name: "Test", active: true }],
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Adapter in stage \"stage1\" must have a valid 'id' string");
    });

    it("rejects adapter with empty id", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [{ id: "", name: "Test", active: true }],
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Adapter in stage \"stage1\" must have a valid 'id' string");
    });

    it("rejects duplicate adapter IDs within stage", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [
              { id: "duplicate", name: "First", active: true },
              { id: "duplicate", name: "Second", active: true },
            ],
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Duplicate adapter id \"duplicate\" found in stage \"stage1\"");
    });

    it("rejects adapter without name", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [{ id: "test", active: true }],
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Adapter in stage \"stage1\" must have a valid 'name' string");
    });

    it("rejects adapter with empty name", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [{ id: "test", name: "", active: true }],
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Adapter in stage \"stage1\" must have a valid 'name' string");
    });

    it("rejects adapter without active flag", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [{ id: "test", name: "Test" }],
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Adapter in stage \"stage1\" must have 'active' boolean");
    });

    it("rejects adapter with non-boolean active", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [{ id: "test", name: "Test", active: "yes" }],
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Adapter in stage \"stage1\" must have 'active' boolean");
    });
  });

  describe("invalid configurations - webhook validation", () => {
    it("rejects invalid outbound webhook URL", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [
              {
                id: "test",
                name: "Test",
                active: true,
                outboundWebhook: { url: "not-a-valid-url" },
              },
            ],
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Adapter \"test\" outboundWebhook.url must be a valid URL");
    });

    it("rejects inbound webhook without urlSuffix", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [
              {
                id: "test",
                name: "Test",
                active: true,
                inboundWebhook: {},
              },
            ],
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Adapter \"test\" inboundWebhook.urlSuffix must be a string starting with '/'");
    });

    it("rejects inbound webhook urlSuffix not starting with slash", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [
              {
                id: "test",
                name: "Test",
                active: true,
                inboundWebhook: { urlSuffix: "no-slash" },
              },
            ],
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Adapter \"test\" inboundWebhook.urlSuffix must be a string starting with '/'");
    });
  });

  describe("invalid configurations - step mappings", () => {
    it("rejects invalid step key", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [
              { id: "test", name: "Test", active: true, outboundWebhook: { url: "https://e.com" } },
            ],
            steps: {
              invalidStep: ["test"],
            },
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Invalid step key \"invalidStep\" in stage \"stage1\"");
    });

    it("rejects step mapping to non-array", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [
              { id: "test", name: "Test", active: true, outboundWebhook: { url: "https://e.com" } },
            ],
            steps: {
              before: "test",
            },
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Step \"before\" in stage \"stage1\" must map to an array of adapter IDs");
    });

    it("rejects step mapping with non-string adapter ID", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [
              { id: "test", name: "Test", active: true, outboundWebhook: { url: "https://e.com" } },
            ],
            steps: {
              before: [123],
            },
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Step \"before\" in stage \"stage1\" contains non-string adapter ID");
    });

    it("rejects step mapping referencing unknown adapter ID", () => {
      const config = {
        satpStages: {
          stage1: {
            adapters: [
              { id: "test", name: "Test", active: true, outboundWebhook: { url: "https://e.com" } },
            ],
            steps: {
              before: ["unknown-adapter"],
            },
          },
        },
      };

      expect(() => {
        validateAdapterConfig({ configValue: config as any });
      }).toThrow("Step \"before\" in stage \"stage1\" references unknown adapter ID \"unknown-adapter\"");
    });
  });

  describe("edge cases", () => {
    it("allows multiple adapters in single step", () => {
      const config: AdapterLayerConfiguration = {
        satpStages: {
          stage1: {
            adapters: [
              { id: "a1", name: "A1", active: true, outboundWebhook: { url: "https://e.com/1" } },
              { id: "a2", name: "A2", active: true, outboundWebhook: { url: "https://e.com/2" } },
              { id: "a3", name: "A3", active: true, outboundWebhook: { url: "https://e.com/3" } },
            ],
            steps: {
              before: ["a1", "a2", "a3"],
            },
          },
        },
      };

      const result = validateAdapterConfig({ configValue: config });

      expect(result).toBe(config);
    });

    it("allows same adapter in multiple steps", () => {
      const config: AdapterLayerConfiguration = {
        satpStages: {
          stage1: {
            adapters: [
              { id: "multi-step", name: "Multi", active: true, outboundWebhook: { url: "https://e.com" } },
            ],
            steps: {
              before: ["multi-step"],
              after: ["multi-step"],
            },
          },
        },
      };

      const result = validateAdapterConfig({ configValue: config });

      expect(result).toBe(config);
    });

    it("allows empty step mapping arrays", () => {
      const config: AdapterLayerConfiguration = {
        satpStages: {
          stage1: {
            adapters: [
              { id: "test", name: "Test", active: true, outboundWebhook: { url: "https://e.com" } },
            ],
            steps: {
              before: [],
            },
          },
        },
      };

      const result = validateAdapterConfig({ configValue: config });

      expect(result).toBe(config);
    });

    it("allows adapters with only inactive flag set", () => {
      const config: AdapterLayerConfiguration = {
        satpStages: {
          stage1: {
            adapters: [
              { id: "inactive", name: "Inactive", active: false },
            ],
          },
        },
      };

      const result = validateAdapterConfig({ configValue: config });

      expect(result).toBe(config);
    });

    it("allows HTTPS and HTTP URLs", () => {
      const config: AdapterLayerConfiguration = {
        satpStages: {
          stage1: {
            adapters: [
              { id: "https", name: "HTTPS", active: true, outboundWebhook: { url: "https://secure.com" } },
              { id: "http", name: "HTTP", active: true, outboundWebhook: { url: "http://insecure.com" } },
            ],
          },
        },
      };

      const result = validateAdapterConfig({ configValue: config });

      expect(result).toBe(config);
    });
  });
});
