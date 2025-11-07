/**
 * Souvenir - Memory management for AI agents built with Vercel AI SDK
 *
 * Implements retrieval strategies from the Cognee paper:
 * "Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning"
 *
 * @packageDocumentation
 */

export { SouvenirProcessor } from "./core/processor.js";
export { RetrievalStrategies } from "./core/retrieval.js";
export { Souvenir } from "./core/souvenir.js";
export { DatabaseClient } from "./db/client.js";
export { MemoryRepository } from "./db/repository.js";
export {
  AIEmbeddingProvider,
  MockEmbeddingProvider,
} from "./embedding/provider.js";
export { GraphOperations } from "./graph/operations.js";

export * from "./types.js";

// Re-export utilities
export {
  type ChunkOptions,
  calculateChunkSize,
  chunkText,
  type RecursiveChunkOptions,
  type RecursiveRulesConfig,
  type TokenChunkOptions,
} from "./utils/chunking.js";
export {
  formatGraphRetrievalForLLM,
  formatGraphTripletsForLLM,
  formatHybridContextForLLM,
  formatSearchResultsForLLM,
  formatSummaryForLLM,
} from "./utils/formatting.js";
