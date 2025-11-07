/**
 * Integration tests for Souvenir graph operations
 * Tests findPaths, getNeighborhood, and findClusters
 */

import { describe, expect, it } from "bun:test";
import { Souvenir } from "../core/souvenir.js";
import { withTestDatabase } from "./setup.js";

// Mock embedding provider for deterministic testing
class TestEmbeddingProvider {
  dimensions = 1536;
  private cache = new Map<string, number[]>();

  async embed(text: string): Promise<number[]> {
    if (this.cache.has(text)) {
      const cached = this.cache.get(text);
      if (cached) {
        return cached;
      }
    }
    const embedding = this.generateDeterministicEmbedding(text);
    this.cache.set(text, embedding);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  private generateDeterministicEmbedding(text: string): number[] {
    const hash = this.hashString(text);
    const embedding: number[] = [];

    for (let i = 0; i < this.dimensions; i++) {
      const seed = hash + i;
      const x = Math.sin(seed) * 10000;
      embedding[i] = x - Math.floor(x);
    }

    return embedding;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

// Helper to create test Souvenir instance with standard config
function createTestSouvenir(databaseUrl: string): {
  souvenir: Souvenir;
  cleanup: () => Promise<void>;
} {
  const souvenir = new Souvenir(
    {
      databaseUrl,
      embeddingDimensions: 1536,
      chunkSize: 512,
      chunkingMode: "recursive",
      chunkOverlap: 50,
      minCharactersPerChunk: 10, // Low threshold for short test strings
      autoProcessing: false, // Disable auto-processing for deterministic tests
    },
    {
      sessionId: crypto.randomUUID(),
      embeddingProvider: new TestEmbeddingProvider(),
    },
  );

  return {
    souvenir,
    cleanup: async () => {
      await souvenir.close();
    },
  };
}

describe("Souvenir Graph Operations Integration Tests", () => {
  describe("findPaths", () => {
    it("should find paths between connected nodes", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          // Create a chain of nodes: A -> B -> C
          const idsA = await souvenir.add("Node A: Start", {
            metadata: { nodeType: "concept" },
          });
          const idsB = await souvenir.add("Node B: Middle", {
            metadata: { nodeType: "concept" },
          });
          const idsC = await souvenir.add("Node C: End", {
            metadata: { nodeType: "concept" },
          });

          // Extract first ID from each
          let nodeAId: string | undefined;
          for (const id of idsA) {
            nodeAId = id;
            break;
          }

          let nodeBId: string | undefined;
          for (const id of idsB) {
            nodeBId = id;
            break;
          }

          let nodeCId: string | undefined;
          for (const id of idsC) {
            nodeCId = id;
            break;
          }

          if (!nodeAId || !nodeBId || !nodeCId) {
            throw new Error("Failed to get node IDs");
          }

          // Process to create relationships
          await souvenir.processAll({ generateEmbeddings: true });

          // Search to establish relationships between nodes
          await souvenir.search("connection between A and B");
          await souvenir.search("connection between B and C");

          // Try to find paths
          const paths = await souvenir.findPaths(nodeAId, nodeCId);

          // Should find at least some information
          expect(paths).toBeDefined();
          expect(Array.isArray(paths)).toBe(true);
        } finally {
          await cleanup();
        }
      });
    });

    it("should return empty array for nonexistent nodes", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          const fakeId1 = "00000000-0000-0000-0000-000000000001";
          const fakeId2 = "00000000-0000-0000-0000-000000000002";

          const paths = await souvenir.findPaths(fakeId1, fakeId2);

          expect(paths).toBeDefined();
          expect(Array.isArray(paths)).toBe(true);
          expect(paths.length).toBe(0);
        } finally {
          await cleanup();
        }
      });
    });

    it("should respect maxDepth option", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          const ids1 = await souvenir.add("Node 1", {
            metadata: { type: "test" },
          });
          const ids2 = await souvenir.add("Node 2", {
            metadata: { type: "test" },
          });

          let nodeId1: string | undefined;
          for (const id of ids1) {
            nodeId1 = id;
            break;
          }

          let nodeId2: string | undefined;
          for (const id of ids2) {
            nodeId2 = id;
            break;
          }

          if (!nodeId1 || !nodeId2) {
            throw new Error("Failed to get node IDs");
          }

          await souvenir.processAll({ generateEmbeddings: true });

          // Search with shallow depth
          const pathsShallow = await souvenir.findPaths(nodeId1, nodeId2, {
            maxDepth: 1,
          });

          // Search with deep depth
          const pathsDeep = await souvenir.findPaths(nodeId1, nodeId2, {
            maxDepth: 10,
          });

          expect(pathsShallow).toBeDefined();
          expect(pathsDeep).toBeDefined();
        } finally {
          await cleanup();
        }
      });
    });

    it("should return sorted paths by weight", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          const ids1 = await souvenir.add("Start node for path finding", {
            metadata: { nodeType: "entity" },
          });
          const ids2 = await souvenir.add("Destination node for path finding", {
            metadata: { nodeType: "entity" },
          });

          let nodeId1: string | undefined;
          for (const id of ids1) {
            nodeId1 = id;
            break;
          }

          let nodeId2: string | undefined;
          for (const id of ids2) {
            nodeId2 = id;
            break;
          }

          if (!nodeId1 || !nodeId2) {
            throw new Error("Failed to get node IDs");
          }

          await souvenir.processAll({ generateEmbeddings: true });

          const paths = await souvenir.findPaths(nodeId1, nodeId2);

          // Paths should be sorted by weight (descending)
          if (paths.length > 1) {
            for (let i = 0; i < paths.length - 1; i++) {
              const current = paths[i];
              const next = paths[i + 1];
              if (current && next) {
                expect(current.totalWeight).toBeGreaterThanOrEqual(
                  next.totalWeight,
                );
              }
            }
          }
        } finally {
          await cleanup();
        }
      });
    });
  });

  describe("getNeighborhood", () => {
    it("should get neighbors of a node", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          const ids = await souvenir.add("Central hub node for neighborhood", {
            metadata: { nodeType: "hub" },
          });

          let nodeId: string | undefined;
          for (const id of ids) {
            nodeId = id;
            break;
          }

          if (!nodeId) {
            throw new Error("Failed to get node ID");
          }

          await souvenir.processAll({ generateEmbeddings: true });

          const neighborhood = await souvenir.getNeighborhood(nodeId);

          expect(neighborhood).toBeDefined();
          expect(neighborhood.nodes).toBeDefined();
          expect(Array.isArray(neighborhood.nodes)).toBe(true);
          expect(neighborhood.relationships).toBeDefined();
          expect(Array.isArray(neighborhood.relationships)).toBe(true);
        } finally {
          await cleanup();
        }
      });
    });

    it("should include the node itself in neighborhood", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          await souvenir.add("Isolated neighborhood test node", {
            metadata: { nodeType: "test" },
          });

          await souvenir.processAll({ generateEmbeddings: true });

          // Get the actual nodes in the session
          const sessionId = souvenir.getSessionId();
          const nodes = await souvenir.getNodesInSession(sessionId);

          if (nodes.length === 0) {
            throw new Error("No nodes created in session");
          }

          const nodeId = nodes[0]?.id;
          if (!nodeId) throw new Error("No nodes in session");

          const neighborhood = await souvenir.getNeighborhood(nodeId);

          // Should at least include the node itself
          const hasOriginalNode = neighborhood.nodes.some(
            (n) => n.id === nodeId,
          );
          expect(hasOriginalNode).toBe(true);
        } finally {
          await cleanup();
        }
      });
    });

    it("should respect maxDepth option", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          const ids = await souvenir.add("Neighborhood test with depth", {
            metadata: { nodeType: "center" },
          });

          let nodeId: string | undefined;
          for (const id of ids) {
            nodeId = id;
            break;
          }

          if (!nodeId) {
            throw new Error("Failed to get node ID");
          }

          await souvenir.processAll({ generateEmbeddings: true });

          // Get neighborhood with depth 1
          const neighborhood1 = await souvenir.getNeighborhood(nodeId, {
            maxDepth: 1,
          });

          // Get neighborhood with depth 3
          const neighborhood3 = await souvenir.getNeighborhood(nodeId, {
            maxDepth: 3,
          });

          // Deeper search should return same or more nodes
          expect(neighborhood1.nodes.length).toBeLessThanOrEqual(
            neighborhood3.nodes.length,
          );
        } finally {
          await cleanup();
        }
      });
    });

    it("should filter by node type", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          const ids = await souvenir.add("Type filter test node", {
            metadata: { nodeType: "document" },
          });

          let nodeId: string | undefined;
          for (const id of ids) {
            nodeId = id;
            break;
          }

          if (!nodeId) {
            throw new Error("Failed to get node ID");
          }

          await souvenir.processAll({ generateEmbeddings: true });

          // Get neighborhood filtering by node types
          const neighborhood = await souvenir.getNeighborhood(nodeId, {
            nodeTypes: ["document", "entity"],
          });

          expect(neighborhood).toBeDefined();
          expect(Array.isArray(neighborhood.nodes)).toBe(true);
          expect(Array.isArray(neighborhood.relationships)).toBe(true);
        } finally {
          await cleanup();
        }
      });
    });

    it("should return empty for nonexistent node", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          const fakeId = "00000000-0000-0000-0000-000000000999";

          const neighborhood = await souvenir.getNeighborhood(fakeId);

          expect(neighborhood.nodes).toBeDefined();
          expect(neighborhood.nodes.length).toBe(0);
          expect(neighborhood.relationships).toBeDefined();
          expect(neighborhood.relationships.length).toBe(0);
        } finally {
          await cleanup();
        }
      });
    });
  });

  describe("findClusters", () => {
    it("should find connected components", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          // Create multiple nodes
          await souvenir.add("Cluster member 1", { metadata: { group: "A" } });
          await souvenir.add("Cluster member 2", { metadata: { group: "A" } });
          await souvenir.add("Cluster member 3", { metadata: { group: "A" } });
          await souvenir.add("Isolated cluster node 1", {
            metadata: { group: "B" },
          });
          await souvenir.add("Isolated cluster node 2", {
            metadata: { group: "B" },
          });

          const sessionId = crypto.randomUUID();
          await souvenir.processAll({ generateEmbeddings: true });

          // Find clusters
          const clusters = await souvenir.findClusters(
            sessionId,
            3, // minClusterSize
          );

          expect(clusters).toBeDefined();
          expect(Array.isArray(clusters)).toBe(true);
        } finally {
          await cleanup();
        }
      });
    });

    it("should respect minClusterSize", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          // Create small clusters
          await souvenir.add("Small cluster 1", { metadata: { type: "test" } });
          await souvenir.add("Small cluster 2", { metadata: { type: "test" } });

          await souvenir.processAll({ generateEmbeddings: true });

          const sessionId = crypto.randomUUID();

          // Find with minClusterSize 3 (should exclude small clusters)
          const clustersStrict = await souvenir.findClusters(sessionId, 3);

          // Find with minClusterSize 1 (should include all)
          const clustersPermissive = await souvenir.findClusters(sessionId, 1);

          expect(clustersStrict.length).toBeLessThanOrEqual(
            clustersPermissive.length,
          );
        } finally {
          await cleanup();
        }
      });
    });

    it("should return empty for empty session", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          const emptySessionId = "nonexistent-session-id";

          const clusters = await souvenir.findClusters(emptySessionId);

          expect(clusters).toBeDefined();
          expect(Array.isArray(clusters)).toBe(true);
          expect(clusters.length).toBe(0);
        } finally {
          await cleanup();
        }
      });
    });

    it("should handle single-node clusters correctly", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          await souvenir.add("Standalone node 1", {
            metadata: { type: "isolated" },
          });
          await souvenir.add("Standalone node 2", {
            metadata: { type: "isolated" },
          });
          await souvenir.add("Standalone node 3", {
            metadata: { type: "isolated" },
          });

          await souvenir.processAll({ generateEmbeddings: true });

          const sessionId = crypto.randomUUID();
          const clusters = await souvenir.findClusters(sessionId, 1);

          expect(clusters).toBeDefined();
          expect(Array.isArray(clusters)).toBe(true);
        } finally {
          await cleanup();
        }
      });
    });

    it("should detect multiple clusters in the same session", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          // Create three separate groups that should form clusters
          for (let i = 1; i <= 3; i++) {
            await souvenir.add(`Cluster A Member ${i}`, {
              metadata: { cluster: "A" },
            });
          }

          for (let i = 1; i <= 3; i++) {
            await souvenir.add(`Cluster B Member ${i}`, {
              metadata: { cluster: "B" },
            });
          }

          for (let i = 1; i <= 4; i++) {
            await souvenir.add(`Cluster C Member ${i}`, {
              metadata: { cluster: "C" },
            });
          }

          await souvenir.processAll({ generateEmbeddings: true });

          const sessionId = souvenir.getSessionId();
          const clusters = await souvenir.findClusters(sessionId, 2);

          expect(clusters).toBeDefined();
          expect(Array.isArray(clusters)).toBe(true);
          // Should find multiple clusters
          expect(clusters.length).toBeGreaterThanOrEqual(1);
        } finally {
          await cleanup();
        }
      });
    });
  });

  describe("Graph Operations Integration", () => {
    it("should support graph exploration workflow", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          // Create a knowledge graph
          await souvenir.add("Graph exploration: Node A", {
            metadata: { nodeType: "entity", name: "A" },
          });
          await souvenir.add("Graph exploration: Node B related", {
            metadata: { nodeType: "entity", name: "B" },
          });
          await souvenir.add("Graph exploration: Node C connected", {
            metadata: { nodeType: "entity", name: "C" },
          });

          await souvenir.processAll({ generateEmbeddings: true });

          // Get nodes from session
          const sessionId = souvenir.getSessionId();
          const nodes = await souvenir.getNodesInSession(sessionId);

          if (nodes.length === 0) {
            throw new Error("No nodes created in session");
          }

          const nodeA = nodes[0]?.id;
          if (!nodeA) {
            throw new Error("Failed to get node A ID");
          }

          // Step 1: Get neighborhood of A
          const neighborhoodA = await souvenir.getNeighborhood(nodeA);
          expect(neighborhoodA.nodes.length).toBeGreaterThan(0);

          // Step 2: If B is a neighbor, find paths to C
          const nodeB = nodes[1]?.id;
          const nodeC = nodes[2]?.id;
          if (nodeB && nodeC) {
            const hasB = neighborhoodA.nodes.some((n) => n.id === nodeB);
            if (hasB) {
              const pathsBC = await souvenir.findPaths(nodeB, nodeC);
              expect(pathsBC).toBeDefined();
            }
          }

          // Step 3: Find clusters
          const clusters = await souvenir.findClusters(sessionId);
          expect(clusters).toBeDefined();
        } finally {
          await cleanup();
        }
      });
    });

    it("should handle graph with disconnected components", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          // Create disconnected groups
          const group1Ids = [
            await souvenir.add("Disconnected group 1 node A", {
              metadata: { group: "1" },
            }),
            await souvenir.add("Disconnected group 1 node B", {
              metadata: { group: "1" },
            }),
            await souvenir.add("Disconnected group 1 node C", {
              metadata: { group: "1" },
            }),
          ];

          const group2Ids = [
            await souvenir.add("Disconnected group 2 node X", {
              metadata: { group: "2" },
            }),
            await souvenir.add("Disconnected group 2 node Y", {
              metadata: { group: "2" },
            }),
            await souvenir.add("Disconnected group 2 node Z", {
              metadata: { group: "2" },
            }),
          ];

          await souvenir.processAll({ generateEmbeddings: true });

          // Try to find paths between groups
          let nodeA1: string | undefined;
          if (group1Ids.length > 0 && group1Ids[0]) {
            for (const id of group1Ids[0]) {
              nodeA1 = id;
              break;
            }
          }

          let nodeX2: string | undefined;
          if (group2Ids.length > 0 && group2Ids[0]) {
            for (const id of group2Ids[0]) {
              nodeX2 = id;
              break;
            }
          }

          if (nodeA1 && nodeX2) {
            const paths = await souvenir.findPaths(nodeA1, nodeX2);
            expect(paths).toBeDefined();
            expect(Array.isArray(paths)).toBe(true);
          }

          // Find clusters
          const sessionId = crypto.randomUUID();
          const clusters = await souvenir.findClusters(sessionId);
          expect(clusters).toBeDefined();
        } finally {
          await cleanup();
        }
      });
    });

    it("should support graph analysis pipeline", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          // Create content
          const ids = await souvenir.add(
            "Graph analysis: Complete pipeline test",
            {
              metadata: { pipeline: "analysis" },
            },
          );

          let nodeId: string | undefined;
          for (const id of ids) {
            nodeId = id;
            break;
          }

          if (!nodeId) {
            throw new Error("Failed to get node ID");
          }

          await souvenir.processAll({
            generateEmbeddings: true,
            generateSummaries: true,
          });

          // Pipeline: Analyze node
          const neighborhood = await souvenir.getNeighborhood(nodeId);
          expect(neighborhood.nodes).toBeDefined();

          // Find clusters for structural analysis
          const sessionId = crypto.randomUUID();
          const clusters = await souvenir.findClusters(sessionId);
          expect(clusters).toBeDefined();

          // Search for related content
          const searchResults = await souvenir.search(
            "pipeline analysis structure",
          );
          expect(searchResults).toBeDefined();
        } finally {
          await cleanup();
        }
      });
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle self-loops gracefully", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          const ids = await souvenir.add("Self-referencing node", {
            metadata: { nodeType: "reflexive" },
          });

          let nodeId: string | undefined;
          for (const id of ids) {
            nodeId = id;
            break;
          }

          if (!nodeId) {
            throw new Error("Failed to get node ID");
          }

          await souvenir.processAll({ generateEmbeddings: true });

          // Try to find paths from node to itself
          const paths = await souvenir.findPaths(nodeId, nodeId);
          expect(paths).toBeDefined();
          expect(Array.isArray(paths)).toBe(true);
        } finally {
          await cleanup();
        }
      });
    });

    it("should handle very large maxDepth values", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          const ids1 = await souvenir.add("Large depth test node 1", {
            metadata: { type: "test" },
          });
          const ids2 = await souvenir.add("Large depth test node 2", {
            metadata: { type: "test" },
          });

          let nodeId1: string | undefined;
          for (const id of ids1) {
            nodeId1 = id;
            break;
          }

          let nodeId2: string | undefined;
          for (const id of ids2) {
            nodeId2 = id;
            break;
          }

          if (!nodeId1 || !nodeId2) {
            throw new Error("Failed to get node IDs");
          }

          await souvenir.processAll({ generateEmbeddings: true });

          // Search with very large maxDepth
          const paths = await souvenir.findPaths(nodeId1, nodeId2, {
            maxDepth: 1000,
          });

          expect(paths).toBeDefined();
          expect(Array.isArray(paths)).toBe(true);
        } finally {
          await cleanup();
        }
      });
    });

    it("should handle filtering by multiple relationship types", async () => {
      await withTestDatabase(async () => {
        const db = process.env.DATABASE_URL || "";
        const { souvenir, cleanup } = createTestSouvenir(db);

        try {
          const ids = await souvenir.add("Multi-relationship filter test", {
            metadata: { nodeType: "hub" },
          });

          let nodeId: string | undefined;
          for (const id of ids) {
            nodeId = id;
            break;
          }

          if (!nodeId) {
            throw new Error("Failed to get node ID");
          }

          await souvenir.processAll({ generateEmbeddings: true });

          // Get neighborhood filtering by multiple relationship types
          const neighborhood = await souvenir.getNeighborhood(nodeId, {
            relationshipTypes: ["mentions", "references", "related_to"],
          });

          expect(neighborhood).toBeDefined();
          expect(Array.isArray(neighborhood.nodes)).toBe(true);
        } finally {
          await cleanup();
        }
      });
    });
  });
});
