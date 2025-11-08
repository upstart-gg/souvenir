import { embed, embedMany } from "ai";
import type { EmbeddingProvider } from "../types.ts";

/**
 * Embedding provider using Vercel AI SDK
 * Supports any embedding model compatible with the AI SDK
 */
export class AIEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private model: Parameters<typeof embed>[0]["model"],
    public dimensions: number = 1536,
  ) {}

  async embed(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: this.model,
      value: text,
    });

    return Array.from(embedding);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const { embeddings } = await embedMany({
      model: this.model,
      values: texts,
    });

    return embeddings.map((e) => Array.from(e));
  }
}

/**
 * Mock embedding provider for testing
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  public dimensions = 1536;

  async embed(text: string): Promise<number[]> {
    // Generate a deterministic embedding based on text hash
    return this.generateMockEmbedding(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  private generateMockEmbedding(text: string): number[] {
    const hash = this.simpleHash(text);
    const embedding = new Array(this.dimensions);

    for (let i = 0; i < this.dimensions; i++) {
      // Use hash to generate pseudo-random but deterministic values
      embedding[i] = Math.sin(hash + i) * 0.5 + 0.5;
    }

    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
}
