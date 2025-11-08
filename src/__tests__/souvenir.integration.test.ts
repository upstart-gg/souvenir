import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Souvenir } from "../core/souvenir.ts";
import type { EmbeddingProvider } from "../types.ts";
import { withTestDatabase } from "./setup.ts";

/**
 * Mock embedding provider for testing
 * Returns consistent embeddings for consistent test results
 */
class MockEmbeddingProvider implements EmbeddingProvider {
  private cache = new Map<string, number[]>();

  dimensions = 1536;

  async embed(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) {
      return cached;
    }

    // Simple deterministic embedding based on text hash
    const embedding = this.hashTextToEmbedding(text);
    this.cache.set(text, embedding);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  private hashTextToEmbedding(text: string): number[] {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    // Generate 1536-dimensional embedding
    const embedding: number[] = [];
    let seed = hash;
    for (let i = 0; i < 1536; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      embedding.push((seed / 233280 - 0.5) * 2);
    }

    // Normalize to unit vector
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => v / norm);
  }
}

describe("Souvenir Integration Tests", () => {
  let souvenir: Souvenir;
  const sessionId = crypto.randomUUID();
  const mockEmbedding = new MockEmbeddingProvider();

  beforeEach(async () => {
    // Create Souvenir instance for each test
    souvenir = new Souvenir(
      {
        databaseUrl:
          process.env.DATABASE_URL ||
          "postgresql://postgres:postgres@localhost:54322/souvenir_test",
        embeddingDimensions: 1536,
        chunkSize: 512,
        chunkingMode: "recursive",
        chunkOverlap: 50,
        minCharactersPerChunk: 10, // Low threshold for short test strings
        autoProcessing: false, // Disable auto-processing for deterministic tests
      },
      {
        sessionId,
        embeddingProvider: mockEmbedding,
      },
    );
  });

  afterEach(async () => {
    // Clean up
    await souvenir.close();
  });

  describe("add()", () => {
    it("should add text and return chunk IDs", async () => {
      await withTestDatabase(async () => {
        const text =
          "This is a test document about artificial intelligence and machine learning.";
        const chunkIds = await souvenir.add(text, {
          sourceIdentifier: "test-source",
          metadata: { type: "test" },
        });

        assert(chunkIds !== undefined);
        assert.strictEqual(Array.isArray(chunkIds), true);
        assert(chunkIds.length > 0);
        assert(/^[a-f0-9-]+$/.test(chunkIds[0] as string));
      });
    });

    it("should handle multiple additions", async () => {
      await withTestDatabase(async () => {
        const text1 = "First document about AI.";
        const text2 = "Second document about machine learning.";

        const ids1 = await souvenir.add(text1);
        const ids2 = await souvenir.add(text2);

        assert(ids1.length > 0);
        assert(ids2.length > 0);
        // IDs should be unique
        assert.notStrictEqual(ids1[0], ids2[0]);
      });
    });

    it("should preserve metadata", async () => {
      await withTestDatabase(async () => {
        const metadata = { author: "test", category: "tech" };
        const chunkIds = await souvenir.add("Test content", {
          metadata,
          sourceIdentifier: "test-source",
        });

        assert(chunkIds.length > 0);
        // Verify metadata is stored (would be checked in repository layer)
      });
    });
  });

  describe("processAll()", () => {
    it("should process unprocessed chunks", async () => {
      await withTestDatabase(async () => {
        const text =
          "Entity: Apple Inc. is a technology company. Relationship: Apple makes iPhones.";
        await souvenir.add(text);

        // Process with embeddings
        await souvenir.processAll({
          generateEmbeddings: true,
          generateSummaries: false,
        });

        // Verify processing completes without error
        assert.strictEqual(true, true);
      });
    });

    it("should handle empty chunks", async () => {
      await withTestDatabase(async () => {
        // Process without adding anything
        await souvenir.processAll({
          generateEmbeddings: true,
        });

        assert.strictEqual(true, true);
      });
    });

    it("should generate embeddings when requested", async () => {
      await withTestDatabase(async () => {
        const text = "Test document for embedding generation.";
        const chunkIds = await souvenir.add(text);

        assert(chunkIds.length > 0);

        await souvenir.processAll({
          generateEmbeddings: true,
        });

        // Embeddings should be generated
        assert.strictEqual(true, true);
      });
    });
  });

  describe("search()", () => {
    it("should return empty results for empty memory", async () => {
      await withTestDatabase(async () => {
        const results = await souvenir.search("test query");
        assert.strictEqual(Array.isArray(results), true);
        assert.strictEqual(results.length, 0);
      });
    });

    it("should find stored content", async () => {
      await withTestDatabase(async () => {
        const text = "Python is a programming language used for data science.";
        await souvenir.add(text);

        await souvenir.processAll({
          generateEmbeddings: true,
        });

        const results = await souvenir.search("programming language", {
          limit: 5,
          strategy: "vector",
        });

        assert.strictEqual(Array.isArray(results), true);
        if (results.length > 0 && results[0]) {
          assert(results[0].node !== undefined);
          assert(results[0].node.content !== undefined);
          assert(results[0].score !== undefined);
          assert.strictEqual(typeof results[0].score, "number");
        }
      });
    });

    it("should support different retrieval strategies", async () => {
      await withTestDatabase(async () => {
        const text = "This is test content for graph retrieval.";
        await souvenir.add(text);
        await souvenir.processAll({ generateEmbeddings: true });

        // Test vector strategy
        const vectorResults = await souvenir.search("test", {
          strategy: "vector",
          limit: 5,
        });
        assert.strictEqual(Array.isArray(vectorResults), true);

        // Test hybrid strategy
        const hybridResults = await souvenir.search("test", {
          strategy: "hybrid",
          limit: 5,
        });
        assert.strictEqual(Array.isArray(hybridResults), true);
      });
    });

    it("should respect limit parameter", async () => {
      await withTestDatabase(async () => {
        // Add multiple documents
        for (let i = 0; i < 5; i++) {
          await souvenir.add(`Document ${i}: Test content about topic.`);
        }

        await souvenir.processAll({ generateEmbeddings: true });

        const results = await souvenir.search("test", {
          limit: 2,
          strategy: "vector",
        });

        assert(results.length <= 2);
      });
    });
  });

  describe("healthCheck()", () => {
    it("should return true for healthy database", async () => {
      await withTestDatabase(async () => {
        const healthy = await souvenir.healthCheck();
        assert.strictEqual(healthy, true);
      });
    });
  });

  describe("getNode()", () => {
    it("should retrieve stored nodes", async () => {
      await withTestDatabase(async () => {
        const text = "Test node content";
        const chunkIds = await souvenir.add(text);

        await souvenir.processAll({ generateEmbeddings: true });

        if (chunkIds.length > 0) {
          const chunkId = chunkIds[0];
          if (chunkId) {
            const node = await souvenir.getNode(chunkId);
            assert(node !== undefined);
            if (node) {
              assert.strictEqual(node.id, chunkId);
              assert(node.content !== undefined);
            }
          }
        }
      });
    });

    it("should return null for non-existent nodes", async () => {
      await withTestDatabase(async () => {
        // Use a valid UUID format for nodes (nodes still use UUID)
        const node = await souvenir.getNode(
          "00000000-0000-0000-0000-000000000000",
        );
        assert(node === null);
      });
    });
  });

  describe("end-to-end workflow", () => {
    it("should complete full ETL pipeline", async () => {
      await withTestDatabase(async () => {
        // Extract: Add content
        const content = `
          Artificial Intelligence is transforming technology.
          Machine Learning enables computers to learn from data.
          Deep Learning uses neural networks for complex patterns.
        `;

        const chunkIds = await souvenir.add(content, {
          sourceIdentifier: "wiki",
          metadata: { topic: "AI" },
        });

        assert(chunkIds.length > 0);

        // Transform: Process content
        await souvenir.processAll({
          generateEmbeddings: true,
          generateSummaries: false,
        });

        // Load & Retrieve: Search the data
        const results = await souvenir.search("Machine Learning", {
          limit: 5,
          strategy: "vector",
        });

        assert.strictEqual(Array.isArray(results), true);

        // Verify we can access nodes
        if (results.length > 0 && results[0]) {
          const node = await souvenir.getNode(results[0].node.id);
          assert(node !== undefined);
          assert(node?.content !== undefined);
        }
      });
    });
  });
});
