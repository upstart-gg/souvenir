import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Souvenir } from "../core/souvenir.ts";
import type { EmbeddingProvider } from "../types.ts";
import { withTestDatabase } from "./setup.ts";

/**
 * Tests to verify that Souvenir works with non-UUID session IDs
 *
 * Session IDs are typed as strings, not restricted to UUIDs.
 * These tests verify that various string formats work correctly:
 * - Simple alphanumeric strings
 * - Numeric strings
 * - Strings with special characters (-, _, .)
 * - Email-like formats
 * - Very long session IDs
 *
 * Also tests that session isolation works correctly with non-UUID IDs.
 */

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

describe("Session ID Handling", () => {
  const mockEmbedding = new MockEmbeddingProvider();

  it("should accept simple string session IDs", async () => {
    await withTestDatabase(async () => {
      const sessionId = "my-session-123";
      const souvenir = new Souvenir(
        {
          databaseUrl:
            process.env.DATABASE_URL ||
            "postgresql://postgres:postgres@localhost:54322/souvenir_test",
          embeddingDimensions: 1536,
          chunkSize: 512,
          chunkingMode: "recursive",
          chunkOverlap: 50,
          minCharactersPerChunk: 10,
          autoProcessing: false,
        },
        {
          sessionId,
          embeddingProvider: mockEmbedding,
        },
      );

      const chunkIds = await souvenir.add("Test content for simple session ID");
      assert(Array.isArray(chunkIds));
      assert(chunkIds.length > 0);

      await souvenir.close();
    });
  });

  it("should accept numeric string session IDs", async () => {
    await withTestDatabase(async () => {
      const sessionId = "12345678";
      const souvenir = new Souvenir(
        {
          databaseUrl:
            process.env.DATABASE_URL ||
            "postgresql://postgres:postgres@localhost:54322/souvenir_test",
          embeddingDimensions: 1536,
          chunkSize: 512,
          chunkingMode: "recursive",
          chunkOverlap: 50,
          minCharactersPerChunk: 10,
          autoProcessing: false,
        },
        {
          sessionId,
          embeddingProvider: mockEmbedding,
        },
      );

      const chunkIds = await souvenir.add(
        "Test content for numeric session ID",
      );
      assert(Array.isArray(chunkIds));
      assert(chunkIds.length > 0);

      await souvenir.close();
    });
  });

  it("should accept session IDs with special characters", async () => {
    await withTestDatabase(async () => {
      const sessionId = "user_session-2024.11.08";
      const souvenir = new Souvenir(
        {
          databaseUrl:
            process.env.DATABASE_URL ||
            "postgresql://postgres:postgres@localhost:54322/souvenir_test",
          embeddingDimensions: 1536,
          chunkSize: 512,
          chunkingMode: "recursive",
          chunkOverlap: 50,
          minCharactersPerChunk: 10,
          autoProcessing: false,
        },
        {
          sessionId,
          embeddingProvider: mockEmbedding,
        },
      );

      const chunkIds = await souvenir.add(
        "Test content for session ID with special characters",
      );
      assert(Array.isArray(chunkIds));
      assert(chunkIds.length > 0);

      await souvenir.close();
    });
  });

  it("should accept email-like session IDs", async () => {
    await withTestDatabase(async () => {
      const sessionId = "user@example.com";
      const souvenir = new Souvenir(
        {
          databaseUrl:
            process.env.DATABASE_URL ||
            "postgresql://postgres:postgres@localhost:54322/souvenir_test",
          embeddingDimensions: 1536,
          chunkSize: 512,
          chunkingMode: "recursive",
          chunkOverlap: 50,
          minCharactersPerChunk: 10,
          autoProcessing: false,
        },
        {
          sessionId,
          embeddingProvider: mockEmbedding,
        },
      );

      const chunkIds = await souvenir.add("Test content for email session ID");
      assert(Array.isArray(chunkIds));
      assert(chunkIds.length > 0);

      await souvenir.close();
    });
  });

  it("should isolate data between different non-UUID sessions", async () => {
    await withTestDatabase(async () => {
      const sessionId1 = "session-alice";
      const sessionId2 = "session-bob";

      const souvenir1 = new Souvenir(
        {
          databaseUrl:
            process.env.DATABASE_URL ||
            "postgresql://postgres:postgres@localhost:54322/souvenir_test",
          embeddingDimensions: 1536,
          chunkSize: 512,
          chunkingMode: "recursive",
          chunkOverlap: 50,
          minCharactersPerChunk: 10,
          autoProcessing: false,
        },
        {
          sessionId: sessionId1,
          embeddingProvider: mockEmbedding,
        },
      );

      const souvenir2 = new Souvenir(
        {
          databaseUrl:
            process.env.DATABASE_URL ||
            "postgresql://postgres:postgres@localhost:54322/souvenir_test",
          embeddingDimensions: 1536,
          chunkSize: 512,
          chunkingMode: "recursive",
          chunkOverlap: 50,
          minCharactersPerChunk: 10,
          autoProcessing: false,
        },
        {
          sessionId: sessionId2,
          embeddingProvider: mockEmbedding,
        },
      );

      // Add content to session 1
      await souvenir1.add("Alice's private data");
      await souvenir1.processAll({ generateEmbeddings: true });

      // Add content to session 2
      await souvenir2.add("Bob's confidential information");
      await souvenir2.processAll({ generateEmbeddings: true });

      // Search in session 1 should not return session 2 data
      const results1 = await souvenir1.search("confidential", { limit: 10 });
      assert(Array.isArray(results1));
      // Session 1 should not see Bob's data
      for (const result of results1) {
        assert(!result.node.content.includes("Bob"));
        assert(!result.node.content.includes("confidential"));
      }

      // Search in session 2 should not return session 1 data
      const results2 = await souvenir2.search("private", { limit: 10 });
      assert(Array.isArray(results2));
      // Session 2 should not see Alice's data
      for (const result of results2) {
        assert(!result.node.content.includes("Alice"));
        assert(!result.node.content.includes("private"));
      }

      await souvenir1.close();
      await souvenir2.close();
    });
  });

  it("should support search and retrieval with non-UUID session IDs", async () => {
    await withTestDatabase(async () => {
      const sessionId = "project-alpha-2024";
      const souvenir = new Souvenir(
        {
          databaseUrl:
            process.env.DATABASE_URL ||
            "postgresql://postgres:postgres@localhost:54322/souvenir_test",
          embeddingDimensions: 1536,
          chunkSize: 512,
          chunkingMode: "recursive",
          chunkOverlap: 50,
          minCharactersPerChunk: 10,
          autoProcessing: false,
        },
        {
          sessionId,
          embeddingProvider: mockEmbedding,
        },
      );

      // Add multiple pieces of content
      await souvenir.add(
        "Project Alpha focuses on machine learning applications",
      );
      await souvenir.add(
        "The team uses TypeScript for the backend implementation",
      );
      await souvenir.add("Database optimization is a key priority");

      // Process all chunks
      await souvenir.processAll({ generateEmbeddings: true });

      // Search for content
      const results = await souvenir.search("machine learning", { limit: 5 });
      assert(Array.isArray(results));
      assert(results.length > 0);

      // Verify results contain relevant content
      const hasRelevantContent = results.some((r) =>
        r.node.content.includes("machine learning"),
      );
      assert(hasRelevantContent);

      await souvenir.close();
    });
  });

  it("should handle very long session IDs", async () => {
    await withTestDatabase(async () => {
      const sessionId =
        "very-long-session-identifier-with-many-characters-for-testing-purposes-2024-11-08-12-34-56";
      const souvenir = new Souvenir(
        {
          databaseUrl:
            process.env.DATABASE_URL ||
            "postgresql://postgres:postgres@localhost:54322/souvenir_test",
          embeddingDimensions: 1536,
          chunkSize: 512,
          chunkingMode: "recursive",
          chunkOverlap: 50,
          minCharactersPerChunk: 10,
          autoProcessing: false,
        },
        {
          sessionId,
          embeddingProvider: mockEmbedding,
        },
      );

      const chunkIds = await souvenir.add(
        "Test content for very long session ID",
      );
      assert(Array.isArray(chunkIds));
      assert(chunkIds.length > 0);

      await souvenir.close();
    });
  });

  it("should support graph operations with non-UUID session IDs", async () => {
    await withTestDatabase(async () => {
      const sessionId = "graph-test-session";
      const souvenir = new Souvenir(
        {
          databaseUrl:
            process.env.DATABASE_URL ||
            "postgresql://postgres:postgres@localhost:54322/souvenir_test",
          embeddingDimensions: 1536,
          chunkSize: 512,
          chunkingMode: "recursive",
          chunkOverlap: 50,
          minCharactersPerChunk: 10,
          autoProcessing: false,
        },
        {
          sessionId,
          embeddingProvider: mockEmbedding,
        },
      );

      // Add content and process
      await souvenir.add("Node A connects to Node B in the graph structure");
      await souvenir.processAll({ generateEmbeddings: true });

      // Try to search with graph exploration
      const results = await souvenir.search("graph", {
        limit: 5,
        strategy: "hybrid",
      });

      assert(Array.isArray(results));

      await souvenir.close();
    });
  });
});
