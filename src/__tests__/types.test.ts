import { describe, expect, test } from "bun:test";
import { SouvenirConfigSchema } from "../types.js";

describe("types", () => {
  describe("SouvenirConfigSchema", () => {
    test("should validate correct config", () => {
      const config = {
        databaseUrl: "postgresql://localhost:5432/test",
        embeddingDimensions: 1536,
        chunkSize: 1000,
        chunkOverlap: 200,
        minRelevanceScore: 0.7,
        maxResults: 10,
        chunkingMode: "recursive" as const,
      };

      const result = SouvenirConfigSchema.parse(config);
      // Schema adds defaults for autoProcessing fields
      expect(result).toEqual({
        ...config,
        autoProcessing: true,
        autoProcessDelay: 1000,
        autoProcessBatchSize: 10,
      });
    });

    test("should apply defaults", () => {
      const config = {
        databaseUrl: "postgresql://localhost:5432/test",
      };

      const result = SouvenirConfigSchema.parse(config);
      expect(result.embeddingDimensions).toBe(1536);
      expect(result.chunkSize).toBe(1000);
      expect(result.chunkOverlap).toBe(200);
      expect(result.minRelevanceScore).toBe(0.7);
      expect(result.maxResults).toBe(10);
      expect(result.autoProcessing).toBe(true);
      expect(result.autoProcessDelay).toBe(1000);
      expect(result.autoProcessBatchSize).toBe(10);
    });

    test("should validate minRelevanceScore range", () => {
      const invalidConfig = {
        databaseUrl: "postgresql://localhost:5432/test",
        minRelevanceScore: 1.5,
      };

      expect(() => SouvenirConfigSchema.parse(invalidConfig)).toThrow();
    });

    test("should require valid URL", () => {
      const invalidConfig = {
        databaseUrl: "not-a-url",
      };

      expect(() => SouvenirConfigSchema.parse(invalidConfig)).toThrow();
    });
  });
});
