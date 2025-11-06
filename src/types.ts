import { z } from 'zod';

/**
 * Configuration for Souvenir memory system
 */
export const SouvenirConfigSchema = z.object({
  databaseUrl: z.string().url(),
  embeddingDimensions: z.number().default(1536),
  chunkSize: z.number().default(1000),
  chunkOverlap: z.number().default(200),
  minRelevanceScore: z.number().min(0).max(1).default(0.7),
  maxResults: z.number().default(10),
  chunkingMode: z.enum(['token', 'recursive']).default('token'),
  chunkingTokenizer: z.string().optional(),
  minCharactersPerChunk: z.number().optional(),
});

export type SouvenirConfig = z.infer<typeof SouvenirConfigSchema>;

/**
 * Memory node representing a unit of information
 */
export interface MemoryNode {
  id: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
  nodeType: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Relationship between memory nodes
 */
export interface MemoryRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  weight: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Memory session grouping related memories
 */
export interface MemorySession {
  id: string;
  sessionName?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Memory chunk before processing
 */
export interface MemoryChunk {
  id: string;
  content: string;
  chunkIndex: number;
  sourceIdentifier?: string;
  metadata: Record<string, unknown>;
  processed: boolean;
  createdAt: Date;
}

/**
 * Search result with relevance score
 */
export interface SearchResult {
  node: MemoryNode;
  score: number;
  relationships?: MemoryRelationship[];
}

/**
 * Options for adding data to memory
 */
export interface AddOptions {
  sourceIdentifier?: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  nodeType?: string;
}

/**
 * Retrieval strategy types (from Cognee paper)
 */
export type RetrievalStrategy =
  | 'vector' // Vector-based chunk retrieval
  | 'graph-neighborhood' // Retrieve graph neighbors
  | 'graph-completion' // Format graph triplets for LLM
  | 'graph-summary' // Use graph summaries
  | 'hybrid'; // Combine multiple strategies

/**
 * Options for searching memory
 */
export interface SearchOptions {
  sessionId?: string;
  nodeTypes?: string[];
  limit?: number;
  minScore?: number;
  includeRelationships?: boolean;
  relationshipTypes?: string[];
  strategy?: RetrievalStrategy;
  topK?: number; // Explicit top-k parameter (per paper)
  formatForLLM?: boolean; // Format output for LLM consumption
}

/**
 * Options for Souvenir memory processing
 */
export interface SouvenirProcessOptions {
  extractEntities?: boolean;
  extractRelationships?: boolean;
  generateEmbeddings?: boolean;
  generateSummaries?: boolean; // Generate summary nodes (per paper)
  sessionId?: string;
  entityPrompt?: string; // Configurable prompt for entity extraction
  relationshipPrompt?: string; // Configurable prompt for relationship extraction
}

/**
 * Entity extracted from content
 */
export interface ExtractedEntity {
  text: string;
  type: string;
  metadata?: Record<string, unknown>;
}

/**
 * Relationship extracted from content
 */
export interface ExtractedRelationship {
  source: string;
  target: string;
  type: string;
  weight?: number;
}

/**
 * Embedding provider interface
 */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
}

/**
 * Graph traversal options
 */
export interface TraversalOptions {
  maxDepth?: number;
  relationshipTypes?: string[];
  nodeTypes?: string[];
}

/**
 * Graph path result
 */
export interface GraphPath {
  nodes: MemoryNode[];
  relationships: MemoryRelationship[];
  totalWeight: number;
}

/**
 * Formatted context for LLM consumption
 */
export interface FormattedContext {
  type: 'text' | 'graph' | 'hybrid';
  content: string;
  sources: {
    nodeId: string;
    score: number;
  }[];
  metadata?: Record<string, unknown>;
}

/**
 * Graph retrieval result with formatted triplets
 */
export interface GraphRetrievalResult {
  node: MemoryNode;
  score: number;
  neighborhood: {
    nodes: MemoryNode[];
    relationships: MemoryRelationship[];
  };
  formattedTriplets?: string; // Formatted for LLM
}

/**
 * Prompt templates for extraction and QA
 */
export interface PromptTemplates {
  entityExtraction?: string;
  relationshipExtraction?: string;
  summarization?: string;
  qa?: string;
}

/**
 * Summary node metadata
 */
export interface SummaryMetadata {
  summaryOf: 'chunk' | 'session' | 'subgraph';
  sourceIds: string[];
  summaryLength: number;
  generatedAt: Date;
}
