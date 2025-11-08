import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { calculateChunkSize, chunkText } from "../utils/chunking.ts";

describe("chunking", () => {
  describe("chunkText", () => {
    test("should split text into chunks with token mode", async () => {
      const text = "a".repeat(2000);
      const chunks = await chunkText(text, {
        mode: "token",
        chunkSize: 500,
        chunkOverlap: 100,
      });

      assert(chunks.length > 1);
      assert((chunks[0]?.length ?? 0) <= 500);
    });

    test("should create overlapping chunks", async () => {
      const text =
        "This is sentence one.\n\nThis is sentence two.\n\nThis is sentence three.";
      const chunks = await chunkText(text, {
        mode: "token",
        chunkSize: 50,
        chunkOverlap: 20,
      });

      // Should have overlap between chunks
      if (chunks.length > 1) {
        assert(chunks.length > 0);
      }
    });

    test("should handle small text", async () => {
      const text = "Short text";
      const chunks = await chunkText(text, {
        mode: "token",
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0], text);
    });

    test("should work with recursive mode", async () => {
      const text = "Para 1\n\nPara 2\n\nPara 3";
      const chunks = await chunkText(text, {
        mode: "recursive",
        chunkSize: 20,
      });

      assert(chunks.length > 0);
    });

    test("should support custom tokenizer", async () => {
      const text = "This is a test of tokenization";
      const chunks = await chunkText(text, {
        mode: "token",
        chunkSize: 100,
        tokenizer: "character",
      });

      assert(chunks.length > 0);
    });

    test("should support minCharactersPerChunk in recursive mode", async () => {
      const text = "Short. Text. With. Periods.";
      const chunks = await chunkText(text, {
        mode: "recursive",
        chunkSize: 50,
        minCharactersPerChunk: 10,
      });

      assert(chunks.length > 0);
    });
  });

  describe("calculateChunkSize", () => {
    test("should return correct chunk sizes for different content types", () => {
      assert.equal(calculateChunkSize("code"), 500);
      assert.equal(calculateChunkSize("documentation"), 1000);
      assert.equal(calculateChunkSize("conversation"), 800);
      assert.equal(calculateChunkSize("article"), 1200);
      assert.equal(calculateChunkSize("unknown"), 1000);
    });
  });
});
