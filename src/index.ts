/**
 * Souvenir - Memory management for AI agents built with Vercel AI SDK
 *
 * @packageDocumentation
 */

export { Souvenir } from './core/souvenir.js';
export { AIEmbeddingProvider, MockEmbeddingProvider } from './embedding/provider.js';
export { SouvenirProcessor } from './core/processor.js';
export { GraphOperations } from './graph/operations.js';
export { DatabaseClient } from './db/client.js';
export { MemoryRepository } from './db/repository.js';

export * from './types.js';

// Re-export utilities
export { chunkText, calculateChunkSize } from './utils/chunking.js';
