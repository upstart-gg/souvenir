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

### Token Chunking (Default - Recommended for Most Agents)

**What it does**: Splits text into fixed-size chunks with configurable overlap.

**Best for**:
- ✅ Conversational memory ("I like pizza", "My name is Alice")
- ✅ User preferences and facts
- ✅ Chat history
- ✅ Short-form content (most agent memory)
- ✅ When you need predictable chunk sizes
- ✅ Fast processing

**Configuration**:
```typescript
const souvenir = new Souvenir({
  databaseUrl: process.env.DATABASE_URL!,
  chunkingMode: 'token', // Default
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
- 👌 Perfect for conversational memory

**Cons**:
- ✂️ May split sentences awkwardly
- 📝 Ignores document structure
- 🎯 Less semantic for long-form content

---

### Recursive Chunking (Advanced - For Structured Content)

**What it does**: Intelligently splits text following natural structure (paragraphs → sentences → words → characters).

**Best for**:
- ✅ Documentation and articles
- ✅ Long-form emails or messages
- ✅ Research papers
- ✅ Knowledge base content
- ✅ Structured documents (headers, sections)

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
- 📚 Respects document structure
- 🎯 Semantic boundaries (complete thoughts)
- 🔍 Better retrieval for long-form content
- ⚙️ Customizable rules

**Cons**:
- 📐 Variable chunk sizes
- 🐢 Slower processing
- 🤔 More complex to configure
- 📄 Requires structured content

---

## Quick Decision Guide

### Use Token Mode (Default) When:
```typescript
// ✅ Most memory management scenarios
const souvenir = new Souvenir({
  chunkingMode: 'token', // Default
  chunkSize: 1000,
  chunkOverlap: 200,
});

// Conversational memories
await souvenir.add("I love Italian food and I'm allergic to shellfish");

// User facts
await souvenir.add("User's birthday is June 5th, 1990");

// Preferences
await souvenir.add("Prefers emails over phone calls");
```

### Use Recursive Mode When:
```typescript
// ✅ Processing structured documents
const souvenir = new Souvenir({
  chunkingMode: 'recursive',
  chunkSize: 1500,
  minCharactersPerChunk: 100,
});

// Long documentation
await souvenir.add(technicalManual);

// Research papers
await souvenir.add(academicPaper);

// Structured emails
await souvenir.add(longEmail);
```

---

## Configuration Parameters

### Common Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `chunkingMode` | `'token' \| 'recursive'` | `'token'` | Chunking strategy |
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

## Performance Considerations

### Token Mode
- ⚡ **Speed**: Fast (~1ms per 1000 chars)
- 💾 **Storage**: More chunks with overlap
- 🎯 **Retrieval**: Fast but less semantic

### Recursive Mode
- 🐢 **Speed**: Slower (~5ms per 1000 chars)
- 💾 **Storage**: Fewer, larger chunks
- 🎯 **Retrieval**: Better semantic boundaries

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

### 1. Start with Token Mode
Most agents work best with the default token mode:
```typescript
{
  chunkingMode: 'token',
  chunkSize: 1000,
  chunkOverlap: 200,
}
```

### 2. Upgrade to Recursive for Documents
Switch to recursive when processing structured content:
```typescript
{
  chunkingMode: 'recursive',
  chunkSize: 1500,
  minCharactersPerChunk: 100,
}
```

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

