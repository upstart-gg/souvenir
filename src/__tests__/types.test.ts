import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SouvenirConfigSchema } from "../types.ts";

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
      assert.deepEqual(result, {
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
      assert.equal(result.embeddingDimensions, 1536);
      assert.equal(result.chunkSize, 1000);
      assert.equal(result.chunkOverlap, 200);
      assert.equal(result.minRelevanceScore, 0.7);
      assert.equal(result.maxResults, 10);
      assert.equal(result.autoProcessing, true);
      assert.equal(result.autoProcessDelay, 1000);
      assert.equal(result.autoProcessBatchSize, 10);
    });

    test("should validate minRelevanceScore range", () => {
      const invalidConfig = {
        databaseUrl: "postgresql://localhost:5432/test",
        minRelevanceScore: 1.5,
      };

      assert.throws(() => SouvenirConfigSchema.parse(invalidConfig));
    });

    test("should require valid URL", () => {
      const invalidConfig = {
        databaseUrl: "not-a-url",
      };

      assert.throws(() => SouvenirConfigSchema.parse(invalidConfig));
    });
  });
});
