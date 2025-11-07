/**
 * Text chunking utilities using chonkiejs
 */

import type { RecursiveLevelConfig } from "@chonkiejs/core";
import {
  RecursiveChunker,
  RecursiveRules,
  TokenChunker,
} from "@chonkiejs/core";

export interface RecursiveChunkOptions {
  mode: "recursive";
  chunkSize: number;
  tokenizer?: string;
  minCharactersPerChunk?: number;
  rules?: RecursiveRulesConfig;
}

export interface TokenChunkOptions {
  mode: "token";
  chunkSize: number;
  chunkOverlap?: number;
  tokenizer?: string;
}

export interface RecursiveRulesConfig {
  levels?: RecursiveLevelConfig[];
}

export type ChunkOptions = RecursiveChunkOptions | TokenChunkOptions;

/**
 * Split text into chunks using chonkiejs
 */
export async function chunkText(
  text: string,
  options: ChunkOptions,
): Promise<string[]> {
  try {
    if (options.mode === "recursive") {
      // Use recursive chunking with hierarchical splitting
      const chunkerConfig: {
        chunkSize: number;
        tokenizer?: string;
        minCharactersPerChunk?: number;
        rules?: RecursiveRules;
      } = {
        chunkSize: options.chunkSize,
      };

      if (options.tokenizer) {
        chunkerConfig.tokenizer = options.tokenizer;
      }

      if (options.minCharactersPerChunk !== undefined) {
        chunkerConfig.minCharactersPerChunk = options.minCharactersPerChunk;
      }

      if (options.rules) {
        chunkerConfig.rules = new RecursiveRules(options.rules);
      }

      const chunker = await RecursiveChunker.create(chunkerConfig);
      const chunks = await chunker.chunk(text);
      return chunks.map((chunk) => chunk.text);
    } else {
      // Use token-based chunking for fixed-size chunks with overlap
      const chunkerConfig: {
        chunkSize: number;
        chunkOverlap?: number;
        tokenizer?: string;
      } = {
        chunkSize: options.chunkSize,
      };

      if (options.chunkOverlap !== undefined) {
        chunkerConfig.chunkOverlap = options.chunkOverlap;
      }

      if (options.tokenizer) {
        chunkerConfig.tokenizer = options.tokenizer;
      }

      const chunker = await TokenChunker.create(chunkerConfig);
      const chunks = await chunker.chunk(text);
      return chunks.map((chunk) => chunk.text);
    }
  } catch (error) {
    // Fallback to simple splitting if chonkiejs fails
    console.warn(
      "Chonkiejs chunking failed, falling back to simple split:",
      error,
    );
    return fallbackChunk(
      text,
      options.chunkSize,
      options.mode === "token" ? options.chunkOverlap || 0 : 0,
    );
  }
}

/**
 * Fallback chunking method
 */
function fallbackChunk(
  text: string,
  chunkSize: number,
  overlap: number,
): string[] {
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

  // With noUncheckedIndexedAccess enabled, indexed access may be undefined.
  // Use an explicit conditional to narrow the type to number.
  const value = sizes[contentType];
  return value ?? (sizes.default as number);
}
