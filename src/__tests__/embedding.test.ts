import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MockEmbeddingProvider } from "../embedding/provider.ts";

describe("MockEmbeddingProvider", () => {
  const provider = new MockEmbeddingProvider();

  test("should generate embeddings of correct dimension", async () => {
    const embedding = await provider.embed("test text");

    assert.equal(embedding.length, 1536);
    assert(embedding.every((v) => typeof v === "number"));
  });

  test("should generate deterministic embeddings", async () => {
    const text = "consistent text";
    const embedding1 = await provider.embed(text);
    const embedding2 = await provider.embed(text);

    assert.deepEqual(embedding1, embedding2);
  });

  test("should generate different embeddings for different text", async () => {
    const embedding1 = await provider.embed("text one");
    const embedding2 = await provider.embed("text two");

    assert.notDeepEqual(embedding1, embedding2);
  });

  test("should batch embed multiple texts", async () => {
    const texts = ["text 1", "text 2", "text 3"];
    const embeddings = await provider.embedBatch(texts);

    assert.equal(embeddings.length, 3);
    assert.equal(embeddings[0]?.length, 1536);
  });

  test("embeddings should be normalized-ish values", async () => {
    const embedding = await provider.embed("test");

    // Check values are in reasonable range for normalized vectors
    assert(embedding.every((v) => v >= 0 && v <= 1));
  });
});
