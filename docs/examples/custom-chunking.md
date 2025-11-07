# Custom Chunking Examples

This guide shows practical examples of both chunking strategies for different agent types.

## Example 1: Chatbot with Conversational Memory (Token Mode)

**Use case**: A customer support chatbot that remembers user preferences and conversation history.

**Why token mode**: Short conversational memories don't have structure to preserve.

```typescript
import { Souvenir } from '@upstart-gg/souvenir';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

// Configure for conversational memory
const souvenir = new Souvenir(
  {
    databaseUrl: process.env.DATABASE_URL!,
    chunkingMode: 'token',      // Default, perfect for conversations
    chunkSize: 500,             // Smaller chunks for short memories
    chunkOverlap: 100,          // Moderate overlap
    embeddingDimensions: 1536,
  },
  {
    embeddingProvider: {
      generateEmbedding: async (text) => {
        const { embedding } = await embed({
          model: openai.embedding('text-embedding-3-small'),
          value: text,
        });
        return embedding;
      },
    },
    processorModel: openai('gpt-4o-mini'),
  }
);

// Add conversational memories
const sessionId = 'user-alice-123';

// Short user preferences
await souvenir.add(
  "I'm Alice. I prefer email over phone calls. I'm allergic to peanuts.",
  { sessionId, metadata: { type: 'preference' } }
);

// Previous conversation context
await souvenir.add(
  "User asked about shipping times. Explained 2-3 business days for standard shipping.",
  { sessionId, metadata: { type: 'conversation' } }
);

// Current issue
await souvenir.add(
  "User wants to return an item purchased last week. Order #12345.",
  { sessionId, metadata: { type: 'current_issue' } }
);

// Process all memories
await souvenir.processAll({
  sessionId,
  generateEmbeddings: true,
  generateSummaries: true,
});

// Retrieve relevant memory
const memories = await souvenir.search('What are the user preferences?', {
  sessionId,
  strategy: 'vector',
  topK: 3,
});

console.log('Retrieved memories:');
for (const memory of memories) {
  console.log(`- ${memory.node.content} (score: ${memory.score})`);
}

// Expected output:
// - I'm Alice. I prefer email over phone calls. I'm allergic to peanuts. (score: 0.92)
// - User wants to return an item purchased last week. Order #12345. (score: 0.75)
// - User asked about shipping times. Explained 2-3 business days... (score: 0.68)

await souvenir.close();
```

**Result**: Each memory is chunked into small, manageable pieces. Retrieval finds exactly the relevant preferences.

---

## Example 2: Documentation Assistant (Recursive Mode)

**Use case**: An agent that helps developers search technical documentation.

**Why recursive mode**: Documentation has headers, sections, and paragraphs that should stay together.

```typescript
import { Souvenir } from '@upstart-gg/souvenir';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

// Configure for documentation
const souvenir = new Souvenir(
  {
    databaseUrl: process.env.DATABASE_URL!,
    chunkingMode: 'recursive',    // Preserves document structure
    chunkSize: 1500,              // Larger chunks for complete sections
    minCharactersPerChunk: 100,   // Avoid tiny chunks
    embeddingDimensions: 1536,
  },
  {
    embeddingProvider: {
      generateEmbedding: async (text) => {
        const { embedding } = await embed({
          model: openai.embedding('text-embedding-3-small'),
          value: text,
        });
        return embedding;
      },
    },
    processorModel: openai('gpt-4o-mini'),
  }
);

// Sample documentation with structure
const documentation = `
## Authentication

To authenticate with our API, use an API key in the Authorization header.

### Getting an API Key

1. Log in to your dashboard
2. Navigate to Settings > API Keys
3. Click "Generate New Key"

Your API key should be kept secret and never committed to version control.

### Using the API Key

Include your API key in every request:

\`\`\`bash
curl -H "Authorization: Bearer YOUR_API_KEY" https://api.example.com/v1/users
\`\`\`

## Rate Limiting

Our API implements rate limiting to ensure fair usage.

### Limits

- Free tier: 100 requests per hour
- Pro tier: 1000 requests per hour
- Enterprise: Unlimited

When you exceed your rate limit, you'll receive a 429 status code.
`;

const sessionId = 'docs';

// Add documentation
await souvenir.add(documentation, {
  sessionId,
  sourceIdentifier: 'api-docs',
  metadata: {
    type: 'documentation',
    section: 'api'
  },
});

// Process with recursive chunking
await souvenir.processAll({
  sessionId,
  generateEmbeddings: true,
  generateSummaries: true,
});

// Search for specific information
const results = await souvenir.search('How do I authenticate?', {
  sessionId,
  strategy: 'vector',
  topK: 2,
});

console.log('Documentation search results:');
for (const result of results) {
  console.log('\n---');
  console.log(result.node.content);
}

// Expected output:
// ---
// ## Authentication
//
// To authenticate with our API, use an API key in the Authorization header.
//
// ### Getting an API Key
//
// 1. Log in to your dashboard
// 2. Navigate to Settings > API Keys
// 3. Click "Generate New Key"
//
// Your API key should be kept secret and never committed to version control.

await souvenir.close();
```

**Result**: Each chunk contains complete sections with headers. Retrieval returns full, coherent documentation snippets.

---

## Example 3: Hybrid Agent (Dynamic Strategy)

**Use case**: An agent that handles both conversations AND documents.

**Solution**: Use different Souvenir instances for different content types, or process dynamically.

### Approach 1: Separate Instances

```typescript
import { Souvenir } from '@upstart-gg/souvenir';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

const embeddingProvider = {
  generateEmbedding: async (text: string) => {
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: text,
    });
    return embedding;
  },
};

// Instance 1: For conversational memory (token mode)
const conversationMemory = new Souvenir(
  {
    databaseUrl: process.env.DATABASE_URL!,
    chunkingMode: 'token',
    chunkSize: 500,
    chunkOverlap: 100,
    embeddingDimensions: 1536,
  },
  {
    embeddingProvider,
    processorModel: openai('gpt-4o-mini'),
  }
);

// Instance 2: For documents (recursive mode)
const documentMemory = new Souvenir(
  {
    databaseUrl: process.env.DATABASE_URL!,
    chunkingMode: 'recursive',
    chunkSize: 1500,
    minCharactersPerChunk: 100,
    embeddingDimensions: 1536,
  },
  {
    embeddingProvider,
    processorModel: openai('gpt-4o-mini'),
  }
);

const sessionId = 'user-bob';

// Add conversational memory
await conversationMemory.add(
  "User prefers dark mode and uses TypeScript",
  { sessionId }
);

// Add document to separate instance
await documentMemory.add(
  longTechnicalDocument,
  { sessionId }
);

// Process both
await conversationMemory.processAll({ sessionId, generateEmbeddings: true });
await documentMemory.processAll({ sessionId, generateEmbeddings: true });

// Search in appropriate memory
const preferences = await conversationMemory.search('What does user prefer?', {
  sessionId,
  topK: 3,
});

const documentation = await documentMemory.search('How to configure TypeScript?', {
  sessionId,
  topK: 3,
});

await conversationMemory.close();
await documentMemory.close();
```

### Approach 2: Manual Chunking

Use the chunking utility directly for fine control:

```typescript
import { Souvenir, chunkText } from '@upstart-gg/souvenir';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

const souvenir = new Souvenir(
  {
    databaseUrl: process.env.DATABASE_URL!,
    // Default config doesn't matter - we'll chunk manually
    embeddingDimensions: 1536,
  },
  {
    embeddingProvider: {
      generateEmbedding: async (text) => {
        const { embedding } = await embed({
          model: openai.embedding('text-embedding-3-small'),
          value: text,
        });
        return embedding;
      },
    },
    processorModel: openai('gpt-4o-mini'),
  }
);

const sessionId = 'user-charlie';

// Function to determine content type
function detectContentType(text: string): 'conversation' | 'document' {
  // Simple heuristic: long text with paragraphs = document
  return text.length > 500 && text.includes('\n\n') ? 'document' : 'conversation';
}

// Function to add with appropriate chunking
async function addWithOptimalChunking(text: string, sessionId: string) {
  const contentType = detectContentType(text);

  let chunks: string[];

  if (contentType === 'conversation') {
    // Use token chunking for conversation
    chunks = await chunkText(text, {
      mode: 'token',
      chunkSize: 500,
      chunkOverlap: 100,
    });
    console.log(`Added conversation memory: ${chunks.length} chunks`);
  } else {
    // Use recursive chunking for documents
    chunks = await chunkText(text, {
      mode: 'recursive',
      chunkSize: 1500,
      minCharactersPerChunk: 100,
    });
    console.log(`Added document memory: ${chunks.length} chunks`);
  }

  // Add each chunk to Souvenir (bypassing automatic chunking)
  for (const chunk of chunks) {
    // Note: We can't bypass chunking in current API
    // This is just for demonstration
    // In practice, use separate instances as shown in Approach 1
  }
}

// Add different content types
await addWithOptimalChunking("User prefers light theme", sessionId);
await addWithOptimalChunking(longArticle, sessionId);

await souvenir.close();
```

---

## Example 4: Advanced Recursive Rules

**Use case**: Index a codebase with custom splitting rules.

```typescript
import { chunkText } from '@upstart-gg/souvenir';

const sourceCode = `
class DatabaseClient {
  constructor(config) {
    this.config = config;
  }

  async connect() {
    // Connection logic here
    console.log('Connected to database');
  }

  async query(sql) {
    // Query execution
    return this.connection.execute(sql);
  }
}

class UserRepository {
  constructor(db) {
    this.db = db;
  }

  async findById(id) {
    return this.db.query('SELECT * FROM users WHERE id = ?', [id]);
  }
}
`;

// Custom rules for code chunking
const codeChunks = await chunkText(sourceCode, {
  mode: 'recursive',
  chunkSize: 500,
  minCharactersPerChunk: 50,
  rules: {
    levels: [
      // Level 1: Split by class definitions
      {
        delimiters: ['\nclass '],
        includeDelim: 'next', // Keep "class" with the chunk
      },
      // Level 2: Split by method definitions
      {
        delimiters: ['\n  async ', '\n  '],
      },
      // Level 3: Split by blank lines
      {
        delimiters: ['\n\n'],
      },
      // Level 4: Split by lines
      {
        delimiters: ['\n'],
      },
      // Level 5: Split by characters (last resort)
      {},
    ],
  },
});

console.log(`Code split into ${codeChunks.length} chunks:`);
codeChunks.forEach((chunk, i) => {
  console.log(`\n--- Chunk ${i + 1} ---`);
  console.log(chunk);
});

// Expected output:
// Chunk 1: class DatabaseClient { ... }
// Chunk 2: class UserRepository { ... }
// Each class is kept together
```

---

## Example 5: Testing Different Configurations

**Use case**: Find the optimal chunking configuration for your content.

```typescript
import { chunkText } from '@upstart-gg/souvenir';

const sampleContent = `
Your typical agent memory content here.
This should represent the kind of text your agent will process.
Include multiple paragraphs, sentences, and typical formatting.

Another paragraph with more information.
Test with realistic content for accurate results.
`;

interface ChunkingConfig {
  name: string;
  config: any;
}

const configurations: ChunkingConfig[] = [
  {
    name: 'Token - Small chunks',
    config: { mode: 'token', chunkSize: 500, chunkOverlap: 100 },
  },
  {
    name: 'Token - Medium chunks',
    config: { mode: 'token', chunkSize: 1000, chunkOverlap: 200 },
  },
  {
    name: 'Token - Large chunks',
    config: { mode: 'token', chunkSize: 2000, chunkOverlap: 400 },
  },
  {
    name: 'Recursive - Default',
    config: { mode: 'recursive', chunkSize: 1500, minCharactersPerChunk: 100 },
  },
  {
    name: 'Recursive - Small',
    config: { mode: 'recursive', chunkSize: 800, minCharactersPerChunk: 50 },
  },
];

console.log(`Testing with content length: ${sampleContent.length} characters\n`);

for (const { name, config } of configurations) {
  const chunks = await chunkText(sampleContent, config);

  const avgLength = chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length;
  const minLength = Math.min(...chunks.map(c => c.length));
  const maxLength = Math.max(...chunks.map(c => c.length));

  console.log(`${name}:`);
  console.log(`  Chunks: ${chunks.length}`);
  console.log(`  Avg length: ${Math.round(avgLength)} chars`);
  console.log(`  Range: ${minLength}-${maxLength} chars`);
  console.log(`  First chunk preview: "${chunks[0].substring(0, 50)}..."`);
  console.log();
}

// Use this output to decide which configuration works best for your content
```

---

## Example 6: Production Configuration

**Use case**: Complete production setup with best practices.

```typescript
import { Souvenir } from '@upstart-gg/souvenir';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

// Production configuration for a general-purpose agent
const souvenir = new Souvenir(
  {
    // Database
    databaseUrl: process.env.DATABASE_URL!,
    embeddingDimensions: 1536,

    // Chunking - Token mode is reliable for most agents
    chunkingMode: 'token',
    chunkSize: 1000,              // Good balance
    chunkOverlap: 200,            // 20% overlap
    chunkingTokenizer: 'Xenova/gpt2', // More accurate than 'character'

    // Search defaults
    minRelevanceScore: 0.7,       // Filter low-quality results
    maxResults: 10,
  },
  {
    // Embeddings
    embeddingProvider: {
      generateEmbedding: async (text) => {
        const { embedding } = await embed({
          model: openai.embedding('text-embedding-3-small'),
          value: text,
        });
        return embedding;
      },
    },

    // Processing model
    processorModel: openai('gpt-4o-mini'),

    // Custom prompts for your domain
    promptTemplates: {
      entityExtraction: `
        Extract named entities from the user's message.
        Focus on: names, places, preferences, facts, dates.
        Format as a list.
      `,
      relationshipExtraction: `
        Extract relationships between entities.
        Format: entity1 | relationship | entity2
      `,
      summarization: `
        Provide a concise 2-3 sentence summary.
        Focus on the main points and user preferences.
      `,
    },
  }
);

// Usage
const sessionId = 'production-user';

try {
  // Add memory
  await souvenir.add("User message here...", { sessionId });

  // Process
  await souvenir.processAll({
    sessionId,
    generateEmbeddings: true,
    generateSummaries: true,
  });

  // Retrieve
  const results = await souvenir.search('query', {
    sessionId,
    strategy: 'hybrid', // Best overall strategy
    topK: 5,
  });

  console.log('Retrieved memories:', results.length);
} catch (error) {
  console.error('Memory operation failed:', error);
} finally {
  await souvenir.close();
}
```

---

## Key Takeaways

### For Most Agents: Use Token Mode ✅
```typescript
{
  chunkingMode: 'token',
  chunkSize: 1000,
  chunkOverlap: 200,
}
```
- Fast and reliable
- Works for 90% of use cases
- Predictable behavior

### For Document Agents: Use Recursive Mode 📚
```typescript
{
  chunkingMode: 'recursive',
  chunkSize: 1500,
  minCharactersPerChunk: 100,
}
```
- Better semantic boundaries
- Preserves structure
- Worth the extra complexity

### Test Your Configuration 🧪
- Use Example 5 to test different configs
- Check chunk sizes and boundaries
- Verify retrieval quality

---

## Next Steps

- [Chunking Guide](/guide/chunking) - Detailed explanation
- [API Reference](/api/chunking) - Complete API docs
- [Configuration](/configuration/chunking) - All options
