/**
 * Souvenir - Memory management for AI agents built with Vercel AI SDK
 *
 * Implements retrieval strategies from the Cognee paper:
 * "Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning"
 *
 * @packageDocumentation
 */

export { SouvenirProcessor } from "./core/processor.ts";
export { RetrievalStrategies } from "./core/retrieval.ts";
export { Souvenir } from "./core/souvenir.ts";
export { DatabaseClient } from "./db/client.ts";
export { MemoryRepository } from "./db/repository.ts";
export {
  AIEmbeddingProvider,
  MockEmbeddingProvider,
} from "./embedding/provider.ts";
export { GraphOperations } from "./graph/operations.ts";

export * from "./types.ts";

// Re-export utilities
export {
  type ChunkOptions,
  calculateChunkSize,
  chunkText,
  type RecursiveChunkOptions,
  type RecursiveRulesConfig,
  type TokenChunkOptions,
} from "./utils/chunking.ts";
export {
  formatGraphRetrievalForLLM,
  formatGraphTripletsForLLM,
  formatHybridContextForLLM,
  formatSearchResultsForLLM,
  formatSummaryForLLM,
} from "./utils/formatting.ts";
