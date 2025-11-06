/**
 * Text chunking utilities using chonkiejs
 */

import { SemanticChunker, TokenChunker } from 'chonkiejs';

export interface ChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
  separator?: string;
  mode?: 'semantic' | 'token';
}

/**
 * Split text into chunks using chonkiejs
 */
export function chunkText(text: string, options: ChunkOptions): string[] {
  const { chunkSize, chunkOverlap, mode = 'token' } = options;

  try {
    if (mode === 'semantic') {
      // Use semantic chunking for better content-aware splitting
      const chunker = new SemanticChunker();
      const chunks = chunker.chunk(text);
      return chunks.map((chunk) => chunk.text);
    } else {
      // Use token-based chunking for more precise control
      const chunker = new TokenChunker({
        chunkSize,
        chunkOverlap,
      });
      const chunks = chunker.chunk(text);
      return chunks.map((chunk) => chunk.text);
    }
  } catch (error) {
    // Fallback to simple splitting if chonkiejs fails
    console.warn('Chonkiejs chunking failed, falling back to simple split:', error);
    return fallbackChunk(text, chunkSize, chunkOverlap);
  }
}

/**
 * Fallback chunking method
 */
function fallbackChunk(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Calculate optimal chunk size based on content type
 */
export function calculateChunkSize(contentType: string): number {
  const sizes: Record<string, number> = {
    code: 500,
    documentation: 1000,
    conversation: 800,
    article: 1200,
    default: 1000,
  };

  return sizes[contentType] || sizes.default;
}
