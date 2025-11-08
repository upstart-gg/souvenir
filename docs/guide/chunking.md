# Chunking Configuration

Understanding chunking is crucial for optimizing your agent's memory. This guide explains the two strategies and when to use each for AI agent memory management.

## Why Chunking Matters

When you add content to memory, Souvenir automatically breaks it into smaller pieces (chunks) because:

1. **LLMs have token limits** - Can't process infinitely long text
2. **Better retrieval** - Find specific relevant information, not entire documents
3. **Efficient embeddings** - Smaller chunks = more precise semantic search
4. **Memory management** - Store and index manageable pieces

## The Two Strategies

Souvenir supports two chunking strategies, each optimized for different content types.

### Recursive Chunking (Default - Recommended for Agents)

**What it does**: Intelligently splits text following natural structure (paragraphs → sentences → words → characters).

**Best for**:
- **Agent memory** - handles both short facts and longer context
- Conversational memory with complete thoughts
- Documentation and articles
- Code snippets and analysis
- Research papers and emails
- Mixed content types (what agents typically save)

**Configuration**:
```typescript
const souvenir = new Souvenir({
  databaseUrl: process.env.DATABASE_URL!,
  chunkingMode: 'recursive',
  chunkSize: 1500,
  minCharactersPerChunk: 100,
  chunkingTokenizer: 'character',
});
```

**How it works**:
```typescript
// Input
"Python is a programming language.\n\nIt was created by Guido van Rossum.\n\nPython is used for web development, data science, and AI."

// Splits by paragraphs first, keeping complete thoughts together
// Chunk 1: "Python is a programming language."
// Chunk 2: "It was created by Guido van Rossum."
// Chunk 3: "Python is used for web development, data science, and AI."
```

**Custom Rules** (Advanced):
```typescript
import { chunkText } from '@upstart.gg/souvenir';

const chunks = await chunkText(documentation, {
  mode: 'recursive',
  chunkSize: 1500,
  minCharactersPerChunk: 100,
  rules: {
    levels: [
      { delimiters: ['\n## ', '\n### '] }, // Split by markdown headers first
      { delimiters: ['\n\n'] },            // Then paragraphs
      { delimiters: ['. ', '! ', '? '] },  // Then sentences
      { whitespace: true },                // Then words
      {},                                  // Finally characters
    ],
  },
});
```

**Pros**:
- 📚 Respects natural text structure  
- 🎯 Semantic boundaries (complete thoughts stay together)
- 🔍 Better retrieval quality across all content types
- 🤖 Handles agent use cases: short facts AND long context
- ⚙️ Customizable rules for specific needs

**Cons**:
- 📐 Variable chunk sizes (less predictable)
- 🐢 Slightly slower (~5ms vs ~1ms per 1000 chars)
- 🤔 More configuration options (though defaults work well)

---

### Token Chunking (For Fixed-Size Requirements)

**What it does**: Splits text into fixed-size chunks with configurable overlap.

**Best for**:
- When you have strict token limits to respect
- Highly predictable chunk sizes required
- Maximum processing speed is critical
- Very uniform, short-form content only

**Configuration**:
```typescript
const souvenir = new Souvenir({
  databaseUrl: process.env.DATABASE_URL!,
  chunkingMode: 'token',
  chunkSize: 1000,       // Tokens per chunk
  chunkOverlap: 200,     // Overlap between chunks
  chunkingTokenizer: 'character', // Optional: 'Xenova/gpt2' for better accuracy
});
```

**How it works**:
```typescript
// Input
"I'm Alice. I work at Acme Corp as a software engineer. I love hiking on weekends."

// With chunkSize=30, chunkOverlap=10
// Chunk 1: "I'm Alice. I work at Acme Co"
// Chunk 2: "Acme Corp as a software engin"
// Chunk 3: "engineer. I love hiking on we"
// Chunk 4: "on weekends."
```

**Pros**:
- ⚡ Fast and simple
- 📏 Predictable chunk sizes (respects token limits)
- 🔄 Overlap preserves context at boundaries

**Cons**:
- ✂️ May split sentences and thoughts awkwardly
- 📝 Ignores document structure
- 🎯 Less semantic coherence
- ❌ Can break context mid-sentence

---

## Quick Decision Guide

### Use Recursive Mode (Default - Recommended)
```typescript
// ✅ Best for most agent memory scenarios
const souvenir = new Souvenir({
  chunkingMode: 'recursive', // This is the default
  chunkSize: 1500,
  minCharactersPerChunk: 100,
});

// Handles everything agents save:
// ✅ Short facts
await souvenir.add("User's name is Bob, allergic to shellfish");

// ✅ Longer context
await souvenir.add("User is working on authentication feature using NextAuth.js with PostgreSQL adapter...");

// ✅ Code snippets
await souvenir.add(codeSnippet);

// ✅ Documentation
await souvenir.add(documentation);
```

### Use Token Mode When:
```typescript
// ⚠️ Only if you have specific requirements
const souvenir = new Souvenir({
  chunkingMode: 'token',
  chunkSize: 1000,
  chunkOverlap: 200,
});

// Use cases:
// - Strict token limits must be enforced
// - Need guaranteed maximum chunk size
// - Processing speed is absolutely critical
```

---

## Configuration Parameters

### Common Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `chunkingMode` | `'token' \| 'recursive'` | `'recursive'` | Chunking strategy |
| `chunkSize` | `number` | `1000` | Target chunk size in tokens |
| `chunkingTokenizer` | `string` | `'character'` | Tokenizer: `'character'`, `'Xenova/gpt2'`, etc. |

### Token Mode Only

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `chunkOverlap` | `number` | `200` | Token overlap between chunks |

### Recursive Mode Only

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `minCharactersPerChunk` | `number` | `24` | Minimum chunk size (avoids tiny chunks) |

---

## Tokenizers

Choose how to count tokens:

### Character Tokenizer (Default)
```typescript
chunkingTokenizer: 'character' // Default
```
- 1 character = 1 token
- Fast and simple
- "hello world" = 11 tokens

### GPT-2 Tokenizer (More Accurate)
```typescript
chunkingTokenizer: 'Xenova/gpt2'
```
- Uses actual GPT tokenization
- More accurate for LLM usage
- "hello world" = 2 tokens
- Requires `@chonkiejs/token` package

### Any HuggingFace Model
```typescript
chunkingTokenizer: 'bert-base-uncased'
// or
chunkingTokenizer: 'Xenova/gpt-4'
```

---

## Overlap Explained (Token Mode)

Overlap helps preserve context at chunk boundaries.

**Without overlap (chunkOverlap=0)**:
```
Chunk 1: "The Eiffel Tower is located"
Chunk 2: "in Paris, France."
```
❌ If you retrieve only Chunk 2, you lose "Eiffel Tower" context

**With overlap (chunkOverlap=10)**:
```
Chunk 1: "The Eiffel Tower is located"
Chunk 2: "Tower is located in Paris, France."
```
✅ Chunk 2 now contains context about what is in Paris

**Recommended overlap amounts**:
- **Small (50-100)**: Storage-efficient, minimal context preservation
- **Medium (200)**: ✅ Balanced (recommended default)
- **Large (400-500)**: Maximum context, higher storage cost

---

## Testing Your Configuration

Test chunking before committing to a strategy:

```typescript
import { chunkText } from '@upstart.gg/souvenir';

// Test with sample content
const sampleText = "Your typical memory content...";

// Try token mode
const tokenChunks = await chunkText(sampleText, {
  mode: 'token',
  chunkSize: 1000,
  chunkOverlap: 200,
});

console.log('Token mode:', tokenChunks.length, 'chunks');
console.log('Example:', tokenChunks[0]);

// Try recursive mode
const recursiveChunks = await chunkText(sampleText, {
  mode: 'recursive',
  chunkSize: 1500,
  minCharactersPerChunk: 100,
});

console.log('Recursive mode:', recursiveChunks.length, 'chunks');
console.log('Example:', recursiveChunks[0]);
```

---

## Best Practices

### 1. Use the Default (Recursive Mode)
The default works great for agents because they save diverse content:
```typescript
{
  chunkingMode: 'recursive', // This is the default - keep it!
  chunkSize: 1500,
  minCharactersPerChunk: 100,
}
```

**Why recursive is best for agents:**
- Agents save both short facts ("user is Bob") AND longer context (code, analysis)
- Keeps complete thoughts together (better retrieval)
- Handles all content types gracefully
- Slight performance trade-off (~4ms extra per 1000 chars) is worth it

### 2. Only Switch to Token Mode If Needed
Only use token mode for specific edge cases:
```typescript
{
  chunkingMode: 'token',
  chunkSize: 1000,
  chunkOverlap: 200,
}
```

**When to consider token mode:**
- You have strict, immutable token limits from your LLM
- You're processing millions of chunks and speed matters more than quality
- You have very uniform, predictable content types

### 3. Adjust Chunk Size Based on Content
- **Short memories (chat)**: 500-1000 tokens
- **Medium content (emails)**: 1000-1500 tokens
- **Long documents**: 1500-2000 tokens

### 4. Use GPT-2 Tokenizer for Production
More accurate token counts:
```typescript
{
  chunkingTokenizer: 'Xenova/gpt2',
}
```

### 5. Test Retrieval Quality
After configuring, test that retrieval returns complete, useful results.

---

## Migrating Between Strategies

To change strategies, update your config and reprocess:

```typescript
// Change configuration
const souvenir = new Souvenir({
  chunkingMode: 'recursive', // Changed from 'token'
  chunkSize: 1500,
  minCharactersPerChunk: 100,
});

// Re-add content (will use new chunking strategy)
await souvenir.add(content, { sessionId });
await souvenir.processAll({ sessionId, generateEmbeddings: true });
```

---

## See Also

- [ETL Pipeline](/guide/etl-pipeline) - How chunking fits in
- [Quick Start](/guide/quick-start) - Configuration reference
- [Retrieval Strategies](/guide/retrieval-strategies) - How chunks are retrieved

