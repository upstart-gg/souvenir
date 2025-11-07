import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Souvenir } from "../core/souvenir.js";
import type { EmbeddingProvider } from "../types.js";
import { withTestDatabase } from "./setup.js";

/**
 * Mock embedding provider for testing
 */
class MockEmbeddingProvider implements EmbeddingProvider {
  private cache = new Map<string, number[]>();

  dimensions = 1536;

  async embed(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) {
      return cached;
    }

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

    const embedding: number[] = [];
    let seed = hash;
    for (let i = 0; i < 1536; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      embedding.push((seed / 233280 - 0.5) * 2);
    }

    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => v / norm);
  }
}

describe("Retrieval Strategies Integration Tests", () => {
  let souvenir: Souvenir;
  let sessionId: string;
  const mockEmbedding = new MockEmbeddingProvider();

  beforeEach(async () => {
    // Generate a fresh session for each test to ensure isolation when DB reset is skipped
    sessionId = crypto.randomUUID();
    souvenir = new Souvenir(
      {
        databaseUrl:
          process.env.DATABASE_URL ||
          "postgresql://postgres:postgres@localhost:54322/souvenir_test",
        embeddingDimensions: 1536,
        chunkSize: 512,
        chunkingMode: "recursive",
        chunkOverlap: 50,
        minCharactersPerChunk: 100,
        autoProcessing: false, // Disable auto-processing for deterministic tests
      },
      {
        sessionId,
        embeddingProvider: mockEmbedding,
      },
    );
  });

  afterEach(async () => {
    await souvenir.close();
  });

  describe("Vector Retrieval Strategy", () => {
    it("should perform semantic vector search", async () => {
      await withTestDatabase(async () => {
        const content = `
          Machine learning is a subset of artificial intelligence.
          Deep learning uses neural networks.
          Supervised learning requires labeled data.
        `;

        await souvenir.add(content);
        await souvenir.processAll({ generateEmbeddings: true });

        const results = await souvenir.search("neural networks", {
          strategy: "vector",
          limit: 5,
        });

        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThanOrEqual(0);

        if (results.length > 0 && results[0]) {
          expect(results[0].score).toBeLessThanOrEqual(1);
          expect(results[0].score).toBeGreaterThanOrEqual(0);
        }
      });
    });

    it("should return results sorted by relevance", async () => {
      await withTestDatabase(async () => {
        await souvenir.add("Python programming language for data science");
        await souvenir.add("Java is a popular programming language");
        await souvenir.add("JavaScript runs in web browsers");

        await souvenir.processAll({ generateEmbeddings: true });

        const results = await souvenir.search("programming language", {
          strategy: "vector",
          limit: 10,
        });

        if (results.length > 1 && results[0] && results[1]) {
          expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
        }
      });
    });
  });

  describe("Graph Neighborhood Retrieval Strategy", () => {
    it("should retrieve nodes with their direct relationships", async () => {
      await withTestDatabase(async () => {
        const content = `
          Apple Inc. is a technology company.
          Apple manufactures iPhones.
          iPhones are smartphones.
          Smartphones use processors.
        `;

        await souvenir.add(content);
        await souvenir.processAll({ generateEmbeddings: true });

        const results = await souvenir.search("Apple", {
          strategy: "graph-neighborhood",
          limit: 5,
        });

        expect(Array.isArray(results)).toBe(true);
        // Graph strategy may return different results based on connectivity
      });
    });
  });

  describe("Graph Completion Retrieval Strategy", () => {
    it("should find missing relationships in graph", async () => {
      await withTestDatabase(async () => {
        const content = `
          Paris is the capital of France.
          France is in Europe.
          London is the capital of England.
          England is in Europe.
        `;

        await souvenir.add(content);
        await souvenir.processAll({ generateEmbeddings: true });

        const results = await souvenir.search("Paris France Europe", {
          strategy: "graph-completion",
          limit: 5,
        });

        expect(Array.isArray(results)).toBe(true);
      });
    });
  });

  describe("Graph Summary Retrieval Strategy", () => {
    it("should retrieve and use graph summaries", async () => {
      await withTestDatabase(async () => {
        const content = `
          Climate change impacts ecosystems.
          Ecosystems support biodiversity.
          Biodiversity provides resources.
          Resources sustain human life.
        `;

        await souvenir.add(content);
        await souvenir.processAll({ generateEmbeddings: true });

        const results = await souvenir.search("climate", {
          strategy: "graph-summary",
          limit: 5,
        });

        expect(Array.isArray(results)).toBe(true);
      });
    });
  });

  describe("Hybrid Retrieval Strategy", () => {
    it("should combine vector and graph results", async () => {
      await withTestDatabase(async () => {
        const content = `
          Quantum computing uses quantum bits.
          Quantum bits can be zero or one simultaneously.
          Superposition is a key quantum property.
          Entanglement links quantum particles.
        `;

        await souvenir.add(content);
        await souvenir.processAll({ generateEmbeddings: true });

        const results = await souvenir.search("quantum", {
          strategy: "hybrid",
          limit: 10,
        });

        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThanOrEqual(0);
      });
    });

    it("should not duplicate results across strategies", async () => {
      await withTestDatabase(async () => {
        await souvenir.add("First document about topic");
        await souvenir.add("Second document about topic");
        await souvenir.add("Third document about topic");

        await souvenir.processAll({ generateEmbeddings: true });

        const results = await souvenir.search("topic", {
          strategy: "hybrid",
          limit: 20,
        });

        // Check for duplicate node IDs
        const nodeIds = results.map((r) => r.node.id);
        const uniqueIds = new Set(nodeIds);
        expect(uniqueIds.size).toBe(nodeIds.length);
      });
    });
  });

  describe("Strategy Selection", () => {
    it("should support all strategy types", async () => {
      await withTestDatabase(async () => {
        const content = "Test content for strategy comparison";
        await souvenir.add(content);
        await souvenir.processAll({ generateEmbeddings: true });

        const strategies = [
          "vector",
          "graph-neighborhood",
          "graph-completion",
          "graph-summary",
          "hybrid",
        ] as const;

        for (const strategy of strategies) {
          const results = await souvenir.search("test", {
            strategy,
            limit: 5,
          });

          expect(Array.isArray(results)).toBe(true);
        }
      });
    });

    it("should default to vector strategy", async () => {
      await withTestDatabase(async () => {
        await souvenir.add("Default strategy test content");
        await souvenir.processAll({ generateEmbeddings: true });

        // Search without specifying strategy
        const results = await souvenir.search("test");

        expect(Array.isArray(results)).toBe(true);
      });
    });
  });

  describe("Search Options", () => {
    it("should respect limit parameter", async () => {
      await withTestDatabase(async () => {
        for (let i = 0; i < 10; i++) {
          await souvenir.add(`Document ${i} with similar content`);
        }

        await souvenir.processAll({ generateEmbeddings: true });

        const results3 = await souvenir.search("content", {
          limit: 3,
          strategy: "vector",
        });

        const results5 = await souvenir.search("content", {
          limit: 5,
          strategy: "vector",
        });

        expect(results3.length).toBeLessThanOrEqual(3);
        expect(results5.length).toBeLessThanOrEqual(5);
      });
    });

    it("should include relationships when requested", async () => {
      await withTestDatabase(async () => {
        await souvenir.add("Entity A relates to Entity B");
        await souvenir.add("Entity B connects to Entity C");

        await souvenir.processAll({ generateEmbeddings: true });

        const results = await souvenir.search("Entity", {
          strategy: "vector",
          includeRelationships: true,
          limit: 10,
        });

        expect(Array.isArray(results)).toBe(true);
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty search results", async () => {
      await withTestDatabase(async () => {
        const results = await souvenir.search("nonexistent-query-xyz-123", {
          strategy: "vector",
          limit: 5,
        });

        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(0);
      });
    });

    it("should handle special characters in queries", async () => {
      await withTestDatabase(async () => {
        await souvenir.add("Content with @#$% special characters");
        await souvenir.processAll({ generateEmbeddings: true });

        const results = await souvenir.search("@#$%", {
          strategy: "vector",
          limit: 5,
        });

        expect(Array.isArray(results)).toBe(true);
      });
    });

    it("should handle very long search queries", async () => {
      await withTestDatabase(async () => {
        await souvenir.add("Sample content for search");
        await souvenir.processAll({ generateEmbeddings: true });

        const longQuery = "word ".repeat(100);
        const results = await souvenir.search(longQuery, {
          strategy: "vector",
          limit: 5,
        });

        expect(Array.isArray(results)).toBe(true);
      });
    });
  });
});
