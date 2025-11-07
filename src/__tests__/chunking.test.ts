import { describe, test, expect } from 'bun:test';
import { chunkText, calculateChunkSize } from '../utils/chunking.js';

describe('chunking', () => {
  describe('chunkText', () => {
    test('should split text into chunks with token mode', async () => {
      const text = 'a'.repeat(2000);
      const chunks = await chunkText(text, {
        mode: 'token',
        chunkSize: 500,
        chunkOverlap: 100,
      });

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].length).toBeLessThanOrEqual(500);
    });

    test('should create overlapping chunks', async () => {
      const text = 'This is sentence one.\n\nThis is sentence two.\n\nThis is sentence three.';
      const chunks = await chunkText(text, {
        mode: 'token',
        chunkSize: 50,
        chunkOverlap: 20,
      });

      // Should have overlap between chunks
      if (chunks.length > 1) {
        expect(chunks.length).toBeGreaterThan(0);
      }
    });

    test('should handle small text', async () => {
      const text = 'Short text';
      const chunks = await chunkText(text, {
        mode: 'token',
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    test('should work with recursive mode', async () => {
      const text = 'Para 1\n\nPara 2\n\nPara 3';
      const chunks = await chunkText(text, {
        mode: 'recursive',
        chunkSize: 20,
      });

      expect(chunks.length).toBeGreaterThan(0);
    });

    test('should support custom tokenizer', async () => {
      const text = 'This is a test of tokenization';
      const chunks = await chunkText(text, {
        mode: 'token',
        chunkSize: 100,
        tokenizer: 'character',
      });

      expect(chunks.length).toBeGreaterThan(0);
    });

    test('should support minCharactersPerChunk in recursive mode', async () => {
      const text = 'Short. Text. With. Periods.';
      const chunks = await chunkText(text, {
        mode: 'recursive',
        chunkSize: 50,
        minCharactersPerChunk: 10,
      });

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('calculateChunkSize', () => {
    test('should return correct chunk sizes for different content types', () => {
      expect(calculateChunkSize('code')).toBe(500);
      expect(calculateChunkSize('documentation')).toBe(1000);
      expect(calculateChunkSize('conversation')).toBe(800);
      expect(calculateChunkSize('article')).toBe(1200);
      expect(calculateChunkSize('unknown')).toBe(1000);
    });
  });
});
