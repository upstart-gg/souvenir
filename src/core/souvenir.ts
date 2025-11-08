import { DatabaseClient } from "../db/client.js";
import { MemoryRepository } from "../db/repository.js";
import { GraphOperations } from "../graph/operations.js";
import type {
  AddOptions,
  EmbeddingProvider,
  FormattedContext,
  GraphPath,
  MemoryNode,
  MemorySession,
  PromptTemplates,
  SearchOptions,
  SearchResult,
  SouvenirConfig,
  SouvenirProcessOptions,
  SummaryMetadata,
  TraversalOptions,
} from "../types.js";
import { chunkText } from "../utils/chunking.js";
import {
  formatGraphRetrievalForLLM,
  formatHybridContextForLLM,
} from "../utils/formatting.js";
import { SouvenirProcessor } from "./processor.js";
import { RetrievalStrategies } from "./retrieval.js";

/**
 * Main Souvenir class - Memory management for AI agents
 *
 * Uses an ETL-inspired pipeline: Extract, Transform, Load
 * Implements retrieval strategies from the Cognee paper
 */
export class Souvenir {
  private db: DatabaseClient;
  private repository: MemoryRepository;
  private graph: GraphOperations;
  private retrieval: RetrievalStrategies;
  private processor?: SouvenirProcessor;
  private embedding?: EmbeddingProvider;
  private embeddingValidated: boolean = false;
  private sessionId: string;
  private processingTimer?: ReturnType<typeof setTimeout>;
  private isProcessing: boolean = false;

  constructor(
    private config: SouvenirConfig,
    options: {
      sessionId: string;
      embeddingProvider?: EmbeddingProvider;
      processorModel?: Parameters<typeof import("ai").generateText>[0]["model"];
      promptTemplates?: Partial<PromptTemplates>;
    },
  ) {
    this.sessionId = options.sessionId;
    this.db = new DatabaseClient(this.config["databaseUrl"] as string);
    this.repository = new MemoryRepository(this.db);
    this.graph = new GraphOperations(this.repository);

    if (options?.embeddingProvider) {
      this.embedding = options.embeddingProvider;
    }

    if (options?.processorModel) {
      this.processor = new SouvenirProcessor(
        options.processorModel,
        options.promptTemplates,
      );
    }

    // Initialize retrieval strategies
    this.retrieval = new RetrievalStrategies(
      this.repository,
      this.graph,
      this.embedding,
    );
  }

  /**
   * Validate that embedding dimensions match configuration
   * Throws error if dimensions don't match
   */
  private async validateEmbeddingDimensions(): Promise<void> {
    if (!this.embedding || this.embeddingValidated) {
      return;
    }

    try {
      // Generate a test embedding
      const testEmbedding = await this.embedding.embed("test");

      // Check if dimensions match
      const expectedDims = this.config["embeddingDimensions"] as number;
      if (testEmbedding.length !== expectedDims) {
        throw new Error(
          `Embedding dimension mismatch: expected ${expectedDims}, but got ${testEmbedding.length}. ` +
            `Please update your SouvenirConfig.embeddingDimensions to match your embedding model's output dimensions.`,
        );
      }

      this.embeddingValidated = true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("dimension mismatch")
      ) {
        throw error;
      }
      // If embedding generation failed for another reason, log warning but don't fail
      console.warn("Could not validate embedding dimensions:", error);
    }
  }

  // ============ Core API ============

  /**
   * Add data to memory (Extract phase)
   * Chunks the data and stores it for later processing
   */
  async add(data: string, options: AddOptions = {}): Promise<string[]> {
    const { sourceIdentifier, metadata = {} } = options;

    // Chunk the data
    const chunkingMode = this.config["chunkingMode"] as string;
    const chunkSize = this.config["chunkSize"] as number;
    const chunkingTokenizer = this.config["chunkingTokenizer"] as
      | string
      | undefined;
    const minCharactersPerChunk = this.config["minCharactersPerChunk"] as
      | number
      | undefined;
    const chunkOverlap = this.config["chunkOverlap"] as number;

    const chunks = await chunkText(
      data,
      chunkingMode === "recursive"
        ? {
            mode: "recursive",
            chunkSize: chunkSize,
            tokenizer: chunkingTokenizer,
            minCharactersPerChunk: minCharactersPerChunk,
          }
        : {
            mode: "token",
            chunkSize: chunkSize,
            chunkOverlap: chunkOverlap,
            tokenizer: chunkingTokenizer,
          },
    );

    const chunkIds: string[] = [];

    // Store sessionId in metadata for filtering during processing
    const chunkMetadata = {
      ...metadata,
      sessionId: this.sessionId,
    };

    // Store chunks
    let i = 0;
    for (const chunk of chunks) {
      const createdChunk = await this.repository.createChunk(
        chunk,
        i,
        sourceIdentifier,
        chunkMetadata,
      );
      // Debug logging removed
      chunkIds.push(createdChunk.id);
      i++;
    }

    // Debug logging removed

    // Schedule auto-processing if enabled
    if (this.config["autoProcessing"] as boolean) {
      this.scheduleProcessing();
    }

    return chunkIds;
  }

  /**
   * Schedule background processing with debouncing
   * Multiple rapid add() calls will be batched together
   */
  private scheduleProcessing(): void {
    // Clear existing timer if any
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
    }

    // Schedule new processing
    const delay = this.config["autoProcessDelay"] as number;
    this.processingTimer = setTimeout(() => {
      this.processAll({
        generateEmbeddings: true,
        generateSummaries: false, // Can be configured
      }).catch((error) => {
        console.error("Auto-processing failed:", error);
      });
    }, delay);
  }

  /**
   * Cancel any scheduled processing
   */
  private cancelScheduledProcessing(): void {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = undefined;
    }
  }

  /**
   * Force immediate processing of all pending chunks
   * Cancels any scheduled processing and processes immediately
   */
  async forceMemoryProcessing(
    options: SouvenirProcessOptions = {},
  ): Promise<void> {
    // Cancel scheduled processing
    this.cancelScheduledProcessing();

    // Wait if already processing
    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Process all pending chunks
    await this.processAll({
      generateEmbeddings: true,
      generateSummaries: false,
      ...options,
    });
  }

  /**
   * Process chunks into memory nodes (Transform phase)
   * Extracts entities, relationships, and generates embeddings
   * Optionally generates summary nodes (per paper)
   */
  async processAll(options: SouvenirProcessOptions = {}): Promise<void> {
    const { generateEmbeddings = true, generateSummaries = false } = options;

    // Prevent concurrent processing
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const chunks = await this.repository.getUnprocessedChunks(this.sessionId);

      if (chunks.length === 0) {
        return;
      }

      // Process chunks in batches
      const batchSize =
        (this.config["autoProcessBatchSize"] as number | undefined) ?? 10;
      const processedNodeIds: string[] = [];

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((chunk) =>
            this.processChunk(chunk, { ...options, generateEmbeddings }),
          ),
        );
        // Collect node IDs for summary generation
        processedNodeIds.push(
          ...(results.filter((id) => id !== null) as string[]),
        );
      }

      // Create relationships between nodes in session
      if (this.processor) {
        await this.createSessionRelationships(this.sessionId);
      }

      // Generate session summary if requested (per paper)
      if (generateSummaries && this.processor && processedNodeIds.length > 0) {
        await this.generateSessionSummary(this.sessionId, processedNodeIds);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single chunk and return the chunk node ID
   */
  private async processChunk(
    chunk: typeof this.repository extends MemoryRepository
      ? Awaited<ReturnType<MemoryRepository["createChunk"]>>
      : never,
    options: SouvenirProcessOptions & { generateEmbeddings?: boolean },
  ): Promise<string | null> {
    const { generateEmbeddings = true } = options;

    // Validate embedding dimensions on first use
    if (generateEmbeddings && this.embedding) {
      await this.validateEmbeddingDimensions();
    }

    // Generate embedding for the chunk
    let embedding: number[] | null = null;
    if (generateEmbeddings && this.embedding) {
      embedding = await this.embedding.embed(chunk.content);
    }

    // Create memory node for the chunk itself
    const chunkNode = await this.repository.createNode(
      chunk.content,
      embedding,
      "chunk",
      {
        ...chunk.metadata,
        sourceIdentifier: chunk.sourceIdentifier,
        chunkIndex: chunk.chunkIndex,
      },
    );

    // Add to session
    await this.repository.addNodeToSession(this.sessionId, chunkNode.id);

    // Extract entities and relationships if processor available
    if (this.processor) {
      const { entities, relationships, summary } =
        await this.processor.processChunk(chunk, options);

      // Create nodes for entities (with deduplication)
      const entityNodes = await Promise.all(
        entities.map(async (entity) => {
          // Check if entity already exists (deduplication)
          let node = await this.repository.findNodeByContentAndType(
            entity.text,
            entity.type,
          );

          if (!node) {
            // Entity doesn't exist, create it
            const entityEmbedding =
              generateEmbeddings && this.embedding
                ? await this.embedding.embed(entity.text)
                : null;

            node = await this.repository.createNode(
              entity.text,
              entityEmbedding,
              entity.type,
              { ...entity.metadata, extractedFrom: chunk.id },
            );
          }

          // Connect entity to chunk (even if entity existed before)
          await this.repository.createRelationship(
            chunkNode.id,
            node.id,
            "contains",
            1.0,
            {},
          );

          // Add entity to session
          await this.repository.addNodeToSession(this.sessionId, node.id);

          return node;
        }),
      );

      // Create relationships between entities
      for (const rel of relationships) {
        const sourceNode = entityNodes.find((n) => n.content === rel.source);
        const targetNode = entityNodes.find((n) => n.content === rel.target);

        if (sourceNode && targetNode) {
          await this.repository.createRelationship(
            sourceNode.id,
            targetNode.id,
            rel.type,
            rel.weight || 1.0,
            {},
          );
        }
      }

      // Update chunk node with summary
      await this.repository.updateNode(this.sessionId, chunkNode.id, {
        metadata: { ...chunkNode.metadata, summary },
      });
    }

    // Mark chunk as processed
    await this.repository.markChunkProcessed(chunk.id);

    // Return the chunk node ID
    return chunkNode.id;
  }

  /**
   * Generate a summary node for a session (per paper)
   */
  private async generateSessionSummary(
    sessionId: string,
    nodeIds: string[],
  ): Promise<void> {
    if (!this.processor || !this.embedding) {
      return;
    }

    // Get content from nodes
    const nodes = await Promise.all(
      nodeIds.map((id) => this.repository.getNode(id)),
    );
    const validNodes = nodes.filter((n) => n !== null) as MemoryNode[];

    if (validNodes.length === 0) {
      return;
    }

    // Generate summary
    const contents = validNodes.map((n) => n.content);
    const summary = await this.processor.generateMultiContentSummary(
      contents,
      "session",
      500,
    );

    // Generate embedding for summary
    const summaryEmbedding = await this.embedding.embed(summary);

    // Create summary node
    const summaryMetadata: SummaryMetadata = {
      summaryOf: "session",
      sourceIds: nodeIds,
      summaryLength: summary.length,
      generatedAt: new Date(),
    };

    const summaryNode = await this.repository.createNode(
      summary,
      summaryEmbedding,
      "summary",
      summaryMetadata as unknown as Record<string, unknown>,
    );

    // Add summary node to session
    await this.repository.addNodeToSession(sessionId, summaryNode.id);

    // Create relationships from summary to source nodes
    for (const nodeId of nodeIds.slice(0, 10)) {
      // Limit to avoid too many edges
      await this.repository.createRelationship(
        summaryNode.id,
        nodeId,
        "summarizes",
        1.0,
        {},
      );
    }
  }

  /**
   * Create relationships between nodes in a session based on semantic similarity
   */
  private async createSessionRelationships(sessionId: string): Promise<void> {
    const nodes = await this.repository.getNodesInSession(sessionId);

    // Create relationships between semantically similar nodes
    for (let i = 0; i < nodes.length; i++) {
      const node1 = nodes[i];
      if (!node1) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const node2 = nodes[j];
        if (!node2) continue;

        if (!node1.embedding || !node2.embedding) continue;

        // Calculate cosine similarity
        const similarity = this.cosineSimilarity(
          node1.embedding,
          node2.embedding,
        );

        // Create relationship if similarity is high enough
        if (similarity >= 0.8) {
          await this.repository.createRelationship(
            node1.id,
            node2.id,
            "similar_to",
            similarity,
            { similarity },
          );
        }
      }
    }
  }

  /**
   * Search memory using configurable retrieval strategies (per paper)
   * Defaults to vector retrieval for backward compatibility
   */
  async search(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const strategy = options.strategy || "vector";

    // Add sessionId and minScore from config if not provided
    const searchOptions = {
      ...options,
      sessionId: this.sessionId,
      minScore:
        options.minScore ?? (this.config["minRelevanceScore"] as number),
    };

    // Debug logging removed

    // Use appropriate retrieval strategy
    switch (strategy) {
      case "vector":
        return this.retrieval.vectorRetrieval(query, searchOptions);

      case "graph-neighborhood": {
        const neighborhoodResults =
          await this.retrieval.graphNeighborhoodRetrieval(query, searchOptions);
        // Convert GraphRetrievalResult to SearchResult for backward compatibility
        return neighborhoodResults.map((gr) => ({
          node: gr.node,
          score: gr.score,
          relationships: gr.neighborhood.relationships,
        }));
      }

      case "graph-completion": {
        const completionResults = await this.retrieval.graphCompletionRetrieval(
          query,
          searchOptions,
        );
        return completionResults.map((gr) => ({
          node: gr.node,
          score: gr.score,
          relationships: gr.neighborhood.relationships,
        }));
      }

      case "graph-summary": {
        const summaryResults =
          await this.retrieval.graphSummaryCompletionRetrieval(
            query,
            searchOptions,
          );
        return summaryResults.map((gr) => ({
          node: gr.node,
          score: gr.score,
          relationships: gr.neighborhood.relationships,
        }));
      }

      case "hybrid": {
        const hybridResults = await this.retrieval.hybridRetrieval(
          query,
          searchOptions,
        );
        // Combine and deduplicate
        const allResults = [...hybridResults.vectorResults];
        const seenIds = new Set(allResults.map((r) => r.node.id));

        for (const gr of hybridResults.graphResults) {
          if (!seenIds.has(gr.node.id)) {
            allResults.push({
              node: gr.node,
              score: gr.score,
              relationships: gr.neighborhood.relationships,
            });
          }
        }
        return allResults;
      }

      default:
        throw new Error(`Unknown retrieval strategy: ${strategy}`);
    }
  }

  /**
   * Search with graph neighborhood retrieval and get formatted context
   * Optimized for LLM consumption (per paper)
   */
  async searchGraph(
    query: string,
    options: SearchOptions = {},
  ): Promise<FormattedContext> {
    const searchOptions = { ...options, sessionId: this.sessionId };
    const results = await this.retrieval.graphCompletionRetrieval(
      query,
      searchOptions,
    );
    return formatGraphRetrievalForLLM(results);
  }

  /**
   * Search with hybrid strategy and get formatted context
   */
  async searchHybrid(
    query: string,
    options: SearchOptions = {},
  ): Promise<FormattedContext> {
    const searchOptions = { ...options, sessionId: this.sessionId };
    const { vectorResults, graphResults } =
      await this.retrieval.hybridRetrieval(query, searchOptions);
    return formatHybridContextForLLM(vectorResults, graphResults);
  }

  // ============ Session Management ============

  async createSession(
    name?: string,
    metadata?: Record<string, unknown>,
  ): Promise<MemorySession> {
    return this.repository.createSession(name, metadata);
  }

  async getSession(id: string): Promise<MemorySession | null> {
    return this.repository.getSession(id);
  }

  // ============ Graph Operations ============

  async findPaths(
    startNodeId: string,
    endNodeId: string,
    options?: TraversalOptions,
  ): Promise<GraphPath[]> {
    return this.graph.findPaths(startNodeId, endNodeId, options);
  }

  async getNeighborhood(
    nodeId: string,
    options?: TraversalOptions,
  ): Promise<{
    nodes: MemoryNode[];
    relationships: import("../types.js").MemoryRelationship[];
  }> {
    return this.graph.getNeighborhood(nodeId, options);
  }

  async findClusters(
    sessionId?: string,
    minClusterSize?: number,
  ): Promise<MemoryNode[][]> {
    return this.graph.findClusters(sessionId, minClusterSize);
  }

  // ============ Direct Node Access ============

  async getNode(id: string): Promise<MemoryNode | null> {
    return this.repository.getNode(id);
  }

  async deleteNode(id: string): Promise<void> {
    await this.repository.deleteNode(id);
  }

  async getNodesInSession(sessionId: string): Promise<MemoryNode[]> {
    return this.repository.getNodesInSession(sessionId);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  // ============ Utility ============

  async healthCheck(): Promise<boolean> {
    return this.db.healthCheck();
  }

  async close(): Promise<void> {
    // Cancel any scheduled processing
    this.cancelScheduledProcessing();

    // Wait for any in-progress processing to complete
    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await this.db.close();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    const aEntries = Array.from(a.entries());
    for (const [i, aVal] of aEntries) {
      const bVal = b[i];
      if (bVal === undefined) continue;

      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
