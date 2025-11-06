import { describe, test, expect } from 'bun:test';
import { MockEmbeddingProvider } from '../embedding/provider.js';

describe('MockEmbeddingProvider', () => {
  const provider = new MockEmbeddingProvider();

  test('should generate embeddings of correct dimension', async () => {
    const embedding = await provider.embed('test text');

    expect(embedding).toHaveLength(1536);
    expect(embedding.every((v) => typeof v === 'number')).toBe(true);
  });

  test('should generate deterministic embeddings', async () => {
    const text = 'consistent text';
    const embedding1 = await provider.embed(text);
    const embedding2 = await provider.embed(text);

    expect(embedding1).toEqual(embedding2);
  });

  test('should generate different embeddings for different text', async () => {
    const embedding1 = await provider.embed('text one');
    const embedding2 = await provider.embed('text two');

    expect(embedding1).not.toEqual(embedding2);
  });

  test('should batch embed multiple texts', async () => {
    const texts = ['text 1', 'text 2', 'text 3'];
    const embeddings = await provider.embedBatch(texts);

    expect(embeddings).toHaveLength(3);
    expect(embeddings[0]).toHaveLength(1536);
  });

  test('embeddings should be normalized-ish values', async () => {
    const embedding = await provider.embed('test');

    // Check values are in reasonable range for normalized vectors
    expect(embedding.every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});
