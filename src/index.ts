/**
 * Souvenir - Memory management for AI agents built with Vercel AI SDK
 *
 * Implements retrieval strategies from the Cognee paper:
 * "Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning"
 *
 * @packageDocumentation
 */

export { Souvenir } from './core/souvenir.js';
export { AIEmbeddingProvider, MockEmbeddingProvider } from './embedding/provider.js';
export { SouvenirProcessor } from './core/processor.js';
export { RetrievalStrategies } from './core/retrieval.js';
export { GraphOperations } from './graph/operations.js';
export { DatabaseClient } from './db/client.js';
export { MemoryRepository } from './db/repository.js';

export * from './types.js';

// Re-export utilities
export {
  chunkText,
  calculateChunkSize,
  type ChunkOptions,
  type RecursiveChunkOptions,
  type TokenChunkOptions,
  type RecursiveRulesConfig,
} from './utils/chunking.js';
export {
  formatSearchResultsForLLM,
  formatGraphRetrievalForLLM,
  formatGraphTripletsForLLM,
  formatHybridContextForLLM,
  formatSummaryForLLM,
} from './utils/formatting.js';
