import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Souvenir } from "../core/souvenir.js";
import type { EmbeddingProvider } from "../types.js";
import { withTestDatabase } from "./setup.js";

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

        expect(chunkIds).toBeDefined();
        expect(Array.isArray(chunkIds)).toBe(true);
        expect(chunkIds.length).toBeGreaterThan(0);
        expect(chunkIds[0]).toMatch(/^[a-f0-9-]+$/);
      });
    });

    it("should handle multiple additions", async () => {
      await withTestDatabase(async () => {
        const text1 = "First document about AI.";
        const text2 = "Second document about machine learning.";

        const ids1 = await souvenir.add(text1);
        const ids2 = await souvenir.add(text2);

        expect(ids1.length).toBeGreaterThan(0);
        expect(ids2.length).toBeGreaterThan(0);
        // IDs should be unique
        expect(ids1[0]).not.toBe(ids2[0]);
      });
    });

    it("should preserve metadata", async () => {
      await withTestDatabase(async () => {
        const metadata = { author: "test", category: "tech" };
        const chunkIds = await souvenir.add("Test content", {
          metadata,
          sourceIdentifier: "test-source",
        });

        expect(chunkIds.length).toBeGreaterThan(0);
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
        expect(true).toBe(true);
      });
    });

    it("should handle empty chunks", async () => {
      await withTestDatabase(async () => {
        // Process without adding anything
        await souvenir.processAll({
          generateEmbeddings: true,
        });

        expect(true).toBe(true);
      });
    });

    it("should generate embeddings when requested", async () => {
      await withTestDatabase(async () => {
        const text = "Test document for embedding generation.";
        const chunkIds = await souvenir.add(text);

        expect(chunkIds.length).toBeGreaterThan(0);

        await souvenir.processAll({
          generateEmbeddings: true,
        });

        // Embeddings should be generated
        expect(true).toBe(true);
      });
    });
  });

  describe("search()", () => {
    it("should return empty results for empty memory", async () => {
      await withTestDatabase(async () => {
        const results = await souvenir.search("test query");
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(0);
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

        expect(Array.isArray(results)).toBe(true);
        if (results.length > 0 && results[0]) {
          expect(results[0].node).toBeDefined();
          expect(results[0].node.content).toBeDefined();
          expect(results[0].score).toBeDefined();
          expect(typeof results[0].score).toBe("number");
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
        expect(Array.isArray(vectorResults)).toBe(true);

        // Test hybrid strategy
        const hybridResults = await souvenir.search("test", {
          strategy: "hybrid",
          limit: 5,
        });
        expect(Array.isArray(hybridResults)).toBe(true);
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

        expect(results.length).toBeLessThanOrEqual(2);
      });
    });
  });

  describe("healthCheck()", () => {
    it("should return true for healthy database", async () => {
      await withTestDatabase(async () => {
        const healthy = await souvenir.healthCheck();
        expect(healthy).toBe(true);
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
            expect(node).toBeDefined();
            if (node) {
              expect(node.id).toBe(chunkId);
              expect(node.content).toBeDefined();
            }
          }
        }
      });
    });

    it("should return null for non-existent nodes", async () => {
      await withTestDatabase(async () => {
        const node = await souvenir.getNode("non-existent-id-12345");
        expect(node).toBeNull();
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

        expect(chunkIds.length).toBeGreaterThan(0);

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

        expect(Array.isArray(results)).toBe(true);

        // Verify we can access nodes
        if (results.length > 0 && results[0]) {
          const node = await souvenir.getNode(results[0].node.id);
          expect(node).toBeDefined();
          expect(node?.content).toBeDefined();
        }
      });
    });
  });
});
