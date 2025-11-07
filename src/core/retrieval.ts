/**
 * Retrieval strategies for Souvenir
 * Implements multiple retrieval approaches from the Cognee paper
 */

import type { MemoryRepository } from "../db/repository.js";
import type { GraphOperations } from "../graph/operations.js";
import type {
  EmbeddingProvider,
  GraphRetrievalResult,
  MemoryNode,
  MemoryRelationship,
  SearchOptions,
  SearchResult,
} from "../types.js";
import {
  formatGraphTripletsForLLM,
  formatSummaryForLLM,
} from "../utils/formatting.js";

/**
 * Retrieval strategy implementations
 */
export class RetrievalStrategies {
  constructor(
    private repository: MemoryRepository,
    private graph: GraphOperations,
    private embedding: EmbeddingProvider | undefined,
  ) {}

  /**
   * Vector-based retrieval (baseline)
   * Retrieves chunks based on embedding similarity
   */
  async vectorRetrieval(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    if (!this.embedding) {
      throw new Error("Embedding provider required for vector retrieval");
    }

    const {
      limit = 10,
      minScore = 0.7,
      nodeTypes,
      sessionId,
      includeRelationships = false,
      relationshipTypes,
    } = options;

    // Generate query embedding
    const queryEmbedding = await this.embedding.embed(query);

    // Search by vector
    let results = await this.repository.searchByVector(
      queryEmbedding,
      limit * 2,
      minScore,
      nodeTypes,
    );

    console.log(
      `[DEBUG vectorRetrieval] Query: "${query}", Initial results: ${results.length}, MinScore: ${minScore}`,
    );

    // Filter by session if provided
    if (sessionId) {
      const sessionNodes = await this.repository.getNodesInSession(sessionId);
      const sessionNodeIds = new Set(sessionNodes.map((n) => n.id));
      console.log(
        `[DEBUG vectorRetrieval] SessionId: ${sessionId.substring(0, 8)}, Session nodes: ${sessionNodes.length}`,
      );
      results = results.filter((r) => sessionNodeIds.has(r.node.id));
      console.log(
        `[DEBUG vectorRetrieval] After session filter: ${results.length} results`,
      );
    }

    // Limit results
    results = results.slice(0, limit);

    // Include relationships if requested
    if (includeRelationships) {
      for (const result of results) {
        result.relationships = await this.repository.getRelationshipsForNode(
          result.node.id,
          relationshipTypes,
        );
      }
    }

    return results;
  }

  /**
   * Summary-based retrieval
   * Retrieves summary nodes that aggregate chunk content (per paper)
   */
  async summaryRetrieval(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    if (!this.embedding) {
      throw new Error("Embedding provider required for summary retrieval");
    }

    // Search for summary nodes
    const summaryResults = await this.vectorRetrieval(query, {
      ...options,
      nodeTypes: ["summary", ...(options.nodeTypes || [])],
    });

    return summaryResults;
  }

  /**
   * Graph neighborhood retrieval
   * Retrieves nodes adjacent to semantically matched entities
   */
  async graphNeighborhoodRetrieval(
    query: string,
    options: SearchOptions = {},
  ): Promise<GraphRetrievalResult[]> {
    if (!this.embedding) {
      throw new Error(
        "Embedding provider required for graph neighborhood retrieval",
      );
    }

    const { limit = 5, topK = 10 } = options;

    // First, find relevant nodes via vector search
    const initialResults = await this.vectorRetrieval(query, {
      ...options,
      limit: limit,
    });

    // For each result, get its neighborhood
    const graphResults: GraphRetrievalResult[] = [];

    for (const result of initialResults) {
      const neighborhood = await this.graph.getNeighborhood(result.node.id, {
        maxDepth: 1, // One hop by default
        nodeTypes: options.nodeTypes,
      });

      // Build node map for formatting
      const allNodes = new Map<string, MemoryNode>();
      allNodes.set(result.node.id, result.node);
      for (const node of neighborhood.nodes) {
        allNodes.set(node.id, node);
      }

      // Format triplets
      const formattedTriplets = formatGraphTripletsForLLM(
        result.node,
        neighborhood.relationships,
        allNodes,
      );

      graphResults.push({
        node: result.node,
        score: result.score,
        neighborhood,
        formattedTriplets,
      });
    }

    return graphResults.slice(0, topK || limit);
  }

  /**
   * Graph completion retrieval
   * Retrieves and formats graph triplets for LLM reasoning (per paper)
   */
  async graphCompletionRetrieval(
    query: string,
    options: SearchOptions = {},
  ): Promise<GraphRetrievalResult[]> {
    if (!this.embedding) {
      throw new Error("Embedding provider required for graph completion");
    }

    const { limit = 5, topK = 20 } = options;

    // Find relevant entity nodes
    const entityResults = await this.vectorRetrieval(query, {
      ...options,
      nodeTypes: options.nodeTypes || [
        "entity",
        "person",
        "organization",
        "concept",
        "event",
      ],
      limit: limit,
    });

    // Get neighborhoods with deeper traversal
    const graphResults: GraphRetrievalResult[] = [];

    for (const result of entityResults) {
      const neighborhood = await this.graph.getNeighborhood(result.node.id, {
        maxDepth: 2, // Two hops for more context
        nodeTypes: options.nodeTypes,
      });

      // Build comprehensive node map
      const allNodes = new Map<string, MemoryNode>();
      allNodes.set(result.node.id, result.node);
      for (const node of neighborhood.nodes) {
        allNodes.set(node.id, node);
      }

      // Format as structured text
      const formattedTriplets = formatGraphTripletsForLLM(
        result.node,
        neighborhood.relationships,
        allNodes,
      );

      graphResults.push({
        node: result.node,
        score: result.score,
        neighborhood,
        formattedTriplets,
      });
    }

    return graphResults.slice(0, topK || limit);
  }

  /**
   * Graph-summary completion
   * Combines summary nodes with graph traversal (per paper)
   */
  async graphSummaryCompletionRetrieval(
    query: string,
    options: SearchOptions = {},
  ): Promise<GraphRetrievalResult[]> {
    if (!this.embedding) {
      throw new Error("Embedding provider required");
    }

    const { limit = 5, topK = 10 } = options;

    // Find relevant summary nodes
    const summaryResults = await this.summaryRetrieval(query, {
      ...options,
      limit,
    });

    // Get source nodes from summaries and build neighborhood
    const graphResults: GraphRetrievalResult[] = [];

    for (const result of summaryResults) {
      const sourceIds = (result.node.metadata["sourceIds"] as string[]) || [];

      // Get neighborhood of source nodes
      const allNodes = new Map<string, MemoryNode>();
      const allRelationships: MemoryRelationship[] = [];

      allNodes.set(result.node.id, result.node);

      for (const sourceId of sourceIds.slice(0, 3)) {
        // Limit to avoid explosion
        const neighborhood = await this.graph.getNeighborhood(sourceId, {
          maxDepth: 1,
        });

        for (const node of neighborhood.nodes) {
          allNodes.set(node.id, node);
        }
        allRelationships.push(...neighborhood.relationships);
      }

      // Format summary + graph context
      const summaryText = formatSummaryForLLM(result.node);
      const graphText = formatGraphTripletsForLLM(
        result.node,
        allRelationships,
        allNodes,
      );

      graphResults.push({
        node: result.node,
        score: result.score,
        neighborhood: {
          nodes: Array.from(allNodes.values()),
          relationships: allRelationships,
        },
        formattedTriplets: `${summaryText}\n\n${graphText}`,
      });
    }

    return graphResults.slice(0, topK || limit);
  }

  /**
   * Hybrid retrieval
   * Combines multiple strategies
   */
  async hybridRetrieval(
    query: string,
    options: SearchOptions = {},
  ): Promise<{
    vectorResults: SearchResult[];
    graphResults: GraphRetrievalResult[];
  }> {
    const { limit = 5 } = options;

    // Run multiple strategies in parallel
    const [vectorResults, graphResults] = await Promise.all([
      this.vectorRetrieval(query, { ...options, limit: Math.ceil(limit / 2) }),
      this.graphCompletionRetrieval(query, {
        ...options,
        limit: Math.ceil(limit / 2),
      }),
    ]);

    return {
      vectorResults,
      graphResults,
    };
  }
}
