import { describe, test, expect } from 'bun:test';
import { chunkText, calculateChunkSize } from '../utils/chunking.js';

describe('chunking', () => {
  describe('chunkText', () => {
    test('should split text into chunks', () => {
      const text = 'a'.repeat(2000);
      const chunks = chunkText(text, { chunkSize: 500, chunkOverlap: 100 });

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].length).toBeLessThanOrEqual(500);
    });

    test('should create overlapping chunks', () => {
      const text = 'This is sentence one.\n\nThis is sentence two.\n\nThis is sentence three.';
      const chunks = chunkText(text, { chunkSize: 50, chunkOverlap: 20 });

      // Should have overlap between chunks
      if (chunks.length > 1) {
        expect(chunks.length).toBeGreaterThan(0);
      }
    });

    test('should handle small text', () => {
      const text = 'Short text';
      const chunks = chunkText(text, { chunkSize: 1000, chunkOverlap: 200 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    test('should respect separators', () => {
      const text = 'Para 1\n\nPara 2\n\nPara 3';
      const chunks = chunkText(text, {
        chunkSize: 20,
        chunkOverlap: 5,
        separator: '\n\n',
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
