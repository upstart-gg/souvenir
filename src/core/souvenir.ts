import { DatabaseClient } from '../db/client.js';
import { MemoryRepository } from '../db/repository.js';
import { GraphOperations } from '../graph/operations.js';
import { SouvenirProcessor } from './processor.js';
import { RetrievalStrategies } from './retrieval.js';
import { chunkText } from '../utils/chunking.js';
import {
  formatSearchResultsForLLM,
  formatGraphRetrievalForLLM,
  formatHybridContextForLLM,
} from '../utils/formatting.js';
import {
  SouvenirConfig,
  AddOptions,
  SearchOptions,
  SouvenirProcessOptions,
  SearchResult,
  GraphRetrievalResult,
  FormattedContext,
  MemoryNode,
  MemorySession,
  EmbeddingProvider,
  GraphPath,
  TraversalOptions,
  PromptTemplates,
  SummaryMetadata,
} from '../types.js';
import type { EmbedParams } from 'ai';

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

  constructor(
    private config: SouvenirConfig,
    options?: {
      embeddingProvider?: EmbeddingProvider;
      processorModel?: Parameters<typeof import('ai').generateText>[0]['model'];
      promptTemplates?: Partial<PromptTemplates>;
    }
  ) {
    this.db = new DatabaseClient(config.databaseUrl);
    this.repository = new MemoryRepository(this.db);
    this.graph = new GraphOperations(this.repository);

    if (options?.embeddingProvider) {
      this.embedding = options.embeddingProvider;
    }

    if (options?.processorModel) {
      this.processor = new SouvenirProcessor(
        options.processorModel,
        options.promptTemplates
      );
    }

    // Initialize retrieval strategies
    this.retrieval = new RetrievalStrategies(
      this.repository,
      this.graph,
      this.embedding
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
      const testEmbedding = await this.embedding.embed('test');

      // Check if dimensions match
      if (testEmbedding.length !== this.config.embeddingDimensions) {
        throw new Error(
          `Embedding dimension mismatch: expected ${this.config.embeddingDimensions}, but got ${testEmbedding.length}. ` +
          `Please update your SouvenirConfig.embeddingDimensions to match your embedding model's output dimensions.`
        );
      }

      this.embeddingValidated = true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('dimension mismatch')) {
        throw error;
      }
      // If embedding generation failed for another reason, log warning but don't fail
      console.warn('Could not validate embedding dimensions:', error);
    }
  }

  // ============ Core API ============

  /**
   * Add data to memory (Extract phase)
   * Chunks the data and stores it for later processing
   */
  async add(data: string, options: AddOptions = {}): Promise<string[]> {
    const { sourceIdentifier, metadata = {}, sessionId } = options;

    // Chunk the data
    const chunks = await chunkText(
      data,
      this.config.chunkingMode === 'recursive'
        ? {
            mode: 'recursive',
            chunkSize: this.config.chunkSize,
            tokenizer: this.config.chunkingTokenizer,
            minCharactersPerChunk: this.config.minCharactersPerChunk,
          }
        : {
            mode: 'token',
            chunkSize: this.config.chunkSize,
            chunkOverlap: this.config.chunkOverlap,
            tokenizer: this.config.chunkingTokenizer,
          }
    );

    const chunkIds: string[] = [];

    // Store sessionId in metadata for filtering during processing
    const chunkMetadata = {
      ...metadata,
      ...(sessionId && { sessionId }),
    };

    // Store chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = await this.repository.createChunk(
        chunks[i],
        i,
        sourceIdentifier,
        chunkMetadata
      );
      chunkIds.push(chunk.id);
    }

    return chunkIds;
  }

  /**
   * Process chunks into memory nodes (Transform phase)
   * Extracts entities, relationships, and generates embeddings
   * Optionally generates summary nodes (per paper)
   */
  async processAll(options: SouvenirProcessOptions = {}): Promise<void> {
    const { generateEmbeddings = true, generateSummaries = false, sessionId } = options;

    const chunks = await this.repository.getUnprocessedChunks(sessionId);

    if (chunks.length === 0) {
      return;
    }

    // Process chunks in batches
    const batchSize = 10;
    const processedNodeIds: string[] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((chunk) => this.processChunk(chunk, { ...options, generateEmbeddings }))
      );
      // Collect node IDs for summary generation
      processedNodeIds.push(...results.filter((id) => id !== null) as string[]);
    }

    // If session provided, create relationships between nodes in session
    if (sessionId && this.processor) {
      await this.createSessionRelationships(sessionId);
    }

    // Generate session summary if requested (per paper)
    if (generateSummaries && sessionId && this.processor && processedNodeIds.length > 0) {
      await this.generateSessionSummary(sessionId, processedNodeIds);
    }
  }

  /**
   * Process a single chunk and return the chunk node ID
   */
  private async processChunk(
    chunk: typeof this.repository extends MemoryRepository
      ? Awaited<ReturnType<MemoryRepository['createChunk']>>
      : never,
    options: SouvenirProcessOptions & { generateEmbeddings?: boolean }
  ): Promise<string | null> {
    const { sessionId, generateEmbeddings = true } = options;

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
      'chunk',
      {
        ...chunk.metadata,
        sourceIdentifier: chunk.sourceIdentifier,
        chunkIndex: chunk.chunkIndex,
      }
    );

    // Add to session if provided
    if (sessionId) {
      await this.repository.addNodeToSession(sessionId, chunkNode.id);
    }

    // Extract entities and relationships if processor available
    if (this.processor) {
      const { entities, relationships, summary } = await this.processor.processChunk(
        chunk,
        options
      );

      // Create nodes for entities (with deduplication)
      const entityNodes = await Promise.all(
        entities.map(async (entity) => {
          // Check if entity already exists (deduplication)
          let node = await this.repository.findNodeByContentAndType(entity.text, entity.type);

          if (!node) {
            // Entity doesn't exist, create it
            const entityEmbedding = generateEmbeddings && this.embedding
              ? await this.embedding.embed(entity.text)
              : null;

            node = await this.repository.createNode(
              entity.text,
              entityEmbedding,
              entity.type,
              { ...entity.metadata, extractedFrom: chunk.id }
            );
          }

          // Connect entity to chunk (even if entity existed before)
          await this.repository.createRelationship(
            chunkNode.id,
            node.id,
            'contains',
            1.0,
            {}
          );

          if (sessionId) {
            await this.repository.addNodeToSession(sessionId, node.id);
          }

          return node;
        })
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
            {}
          );
        }
      }

      // Update chunk node with summary
      await this.repository.updateNode(chunkNode.id, {
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
    nodeIds: string[]
  ): Promise<void> {
    if (!this.processor || !this.embedding) {
      return;
    }

    // Get content from nodes
    const nodes = await Promise.all(nodeIds.map((id) => this.repository.getNode(id)));
    const validNodes = nodes.filter((n) => n !== null) as MemoryNode[];

    if (validNodes.length === 0) {
      return;
    }

    // Generate summary
    const contents = validNodes.map((n) => n.content);
    const summary = await this.processor.generateMultiContentSummary(contents, 'session', 500);

    // Generate embedding for summary
    const summaryEmbedding = await this.embedding.embed(summary);

    // Create summary node
    const summaryMetadata: SummaryMetadata = {
      summaryOf: 'session',
      sourceIds: nodeIds,
      summaryLength: summary.length,
      generatedAt: new Date(),
    };

    const summaryNode = await this.repository.createNode(
      summary,
      summaryEmbedding,
      'summary',
      summaryMetadata
    );

    // Add summary node to session
    await this.repository.addNodeToSession(sessionId, summaryNode.id);

    // Create relationships from summary to source nodes
    for (const nodeId of nodeIds.slice(0, 10)) {
      // Limit to avoid too many edges
      await this.repository.createRelationship(
        summaryNode.id,
        nodeId,
        'summarizes',
        1.0,
        {}
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
      for (let j = i + 1; j < nodes.length; j++) {
        const node1 = nodes[i];
        const node2 = nodes[j];

        if (!node1.embedding || !node2.embedding) continue;

        // Calculate cosine similarity
        const similarity = this.cosineSimilarity(node1.embedding, node2.embedding);

        // Create relationship if similarity is high enough
        if (similarity >= 0.8) {
          await this.repository.createRelationship(
            node1.id,
            node2.id,
            'similar_to',
            similarity,
            { similarity }
          );
        }
      }
    }
  }

  /**
   * Search memory using configurable retrieval strategies (per paper)
   * Defaults to vector retrieval for backward compatibility
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const strategy = options.strategy || 'vector';
    const formatForLLM = options.formatForLLM || false;

    // Use appropriate retrieval strategy
    switch (strategy) {
      case 'vector':
        return this.retrieval.vectorRetrieval(query, options);

      case 'graph-neighborhood':
        const neighborhoodResults = await this.retrieval.graphNeighborhoodRetrieval(
          query,
          options
        );
        // Convert GraphRetrievalResult to SearchResult for backward compatibility
        return neighborhoodResults.map((gr) => ({
          node: gr.node,
          score: gr.score,
          relationships: gr.neighborhood.relationships,
        }));

      case 'graph-completion':
        const completionResults = await this.retrieval.graphCompletionRetrieval(query, options);
        return completionResults.map((gr) => ({
          node: gr.node,
          score: gr.score,
          relationships: gr.neighborhood.relationships,
        }));

      case 'graph-summary':
        const summaryResults = await this.retrieval.graphSummaryCompletionRetrieval(
          query,
          options
        );
        return summaryResults.map((gr) => ({
          node: gr.node,
          score: gr.score,
          relationships: gr.neighborhood.relationships,
        }));

      case 'hybrid':
        const hybridResults = await this.retrieval.hybridRetrieval(query, options);
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

      default:
        throw new Error(`Unknown retrieval strategy: ${strategy}`);
    }
  }

  /**
   * Search with graph neighborhood retrieval and get formatted context
   * Optimized for LLM consumption (per paper)
   */
  async searchGraph(query: string, options: SearchOptions = {}): Promise<FormattedContext> {
    const results = await this.retrieval.graphCompletionRetrieval(query, options);
    return formatGraphRetrievalForLLM(results);
  }

  /**
   * Search with hybrid strategy and get formatted context
   */
  async searchHybrid(query: string, options: SearchOptions = {}): Promise<FormattedContext> {
    const { vectorResults, graphResults } = await this.retrieval.hybridRetrieval(query, options);
    return formatHybridContextForLLM(vectorResults, graphResults);
  }

  // ============ Session Management ============

  async createSession(name?: string, metadata?: Record<string, unknown>): Promise<MemorySession> {
    return this.repository.createSession(name, metadata);
  }

  async getSession(id: string): Promise<MemorySession | null> {
    return this.repository.getSession(id);
  }

  // ============ Graph Operations ============

  async findPaths(
    startNodeId: string,
    endNodeId: string,
    options?: TraversalOptions
  ): Promise<GraphPath[]> {
    return this.graph.findPaths(startNodeId, endNodeId, options);
  }

  async getNeighborhood(
    nodeId: string,
    options?: TraversalOptions
  ): Promise<{ nodes: MemoryNode[]; relationships: import('../types.js').MemoryRelationship[] }> {
    return this.graph.getNeighborhood(nodeId, options);
  }

  async findClusters(sessionId?: string, minClusterSize?: number): Promise<MemoryNode[][]> {
    return this.graph.findClusters(sessionId, minClusterSize);
  }

  // ============ Direct Node Access ============

  async getNode(id: string): Promise<MemoryNode | null> {
    return this.repository.getNode(id);
  }

  async deleteNode(id: string): Promise<void> {
    await this.repository.deleteNode(id);
  }

  // ============ Utility ============

  async healthCheck(): Promise<boolean> {
    return this.db.healthCheck();
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
