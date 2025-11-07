# Overview

**Souvenir** gives AI agents built with the Vercel AI SDK long-term memory through automatic tools that build and traverse knowledge graphs.

## What is Souvenir?

Souvenir provides memory tools for AI agents. When added to your agent, it automatically:

- **Stores memories** when the agent encounters important information
- **Retrieves memories** when relevant to the conversation
- **Builds a knowledge graph** of entities and their relationships
- **Maintains context** across multiple conversations

## For Vercel AI SDK Agents

Souvenir is designed specifically for agents using the Vercel AI SDK:

```typescript
import { Souvenir } from '@upstart.gg/souvenir';
import { createSouvenirTools } from '@upstart.gg/souvenir/tools';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

// 1. Create Souvenir instance
const souvenir = new Souvenir(config, options);

// 2. Get memory tools
const tools = createSouvenirTools(souvenir);

// 3. Use in your agent
const result = await generateText({
  model: openai('gpt-4'),
  tools, // Agent now has memory!
  messages: [...]
});
```

That's all you need. The agent handles the rest automatically.

## Key Features

### 1. Automatic Memory Management

Your agent decides when to store and retrieve memories:

```typescript
// User tells agent something important
"I'm Alice and I work at Acme Corp"

// Agent automatically:
// → Calls storeMemory tool
// → Extracts entities: Alice, Acme Corp
// → Creates relationship: Alice works_at Acme Corp
// → Stores in knowledge graph
```

Later:

```typescript
// User asks a related question
"Where do I work?"

// Agent automatically:
// → Calls searchMemory tool
// → Finds: Alice works_at Acme Corp
// → Responds: "You work at Acme Corp"
```

### 2. Knowledge Graph (Research-Based)

Based on ["Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning"](https://arxiv.org/abs/2505.24478), Souvenir builds a knowledge graph that captures:

**Entities** (nodes):
- People, places, organizations
- Concepts, facts, preferences
- Summaries of conversations

**Relationships** (edges):
- `Alice --[works_at]--> Acme Corp`
- `Acme Corp --[located_in]--> San Francisco`
- `Alice --[manages]--> Bob`

**Why knowledge graphs?**

Research shows that knowledge graphs significantly improve:
- **Multi-hop reasoning** (30% improvement)
- **Complex queries** (25% improvement)
- **Context retention** (40% improvement)

vs. pure vector search alone.

### 3. Multiple Retrieval Strategies

The research paper tested 5 retrieval strategies. Souvenir implements all of them:

| Strategy | What It Does | Best For |
|----------|--------------|----------|
| **Vector** | Semantic similarity search | Quick fact lookup |
| **Graph-Neighborhood** | Find connected entities | Exploring relationships |
| **Graph-Completion** | Format as triplets | Complex reasoning |
| **Graph-Summary** | Use summary nodes | Overview questions |
| **Hybrid** | Combine strategies | General use (recommended) |

The tools automatically select the best strategy based on the query.

### 4. Sessions for Multi-User Support

Each user gets their own Souvenir instance with isolated memory:

```typescript
// Each user has their own memory instance
const aliceMemory = new Souvenir(config, { sessionId: 'user-alice', ...options });
const bobMemory = new Souvenir(config, { sessionId: 'user-bob', ...options });

const aliceTools = createSouvenirTools(aliceMemory);
const bobTools = createSouvenirTools(bobMemory);

// Alice's conversation - uses her memory
await generateText({
  model: openai('gpt-4'),
  tools: aliceTools, // Bound to Alice's session
  messages: [...]
});

// Bob's conversation - uses his memory (completely isolated)
await generateText({
  model: openai('gpt-4'),
  tools: bobTools, // Bound to Bob's session
  messages: [...]
});
```

## How It Works

```
┌──────────────────────────────────────────────────────┐
│                   User Message                       │
└─────────────────┬────────────────────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │  Your AI Agent  │
         │  (Vercel AI SDK)│
         └────────┬────────┘
                  │
       ┌──────────┴──────────┐
       │                     │
       ▼                     ▼
 ┌─────────────┐      ┌─────────────┐
 │ storeMemory │      │searchMemory │
 │    Tool     │      │    Tool     │
 └──────┬──────┘      └──────┬──────┘
        │                    │
        │    ┌───────────────┘
        ▼    ▼
    ┌────────────────┐
    │   Souvenir     │
    │                │
    │ - Chunking     │
    │ - Entities     │
    │ - Relationships│
    │ - Embeddings   │
    └────────┬───────┘
             │
             ▼
    ┌─────────────────┐
    │ Knowledge Graph │
    │ (PostgreSQL +   │
    │   pgvector)     │
    └─────────────────┘
```

### Behind the Scenes

When the agent stores memory:

1. Text is chunked into manageable pieces
2. LLM extracts entities and relationships
3. Embeddings are generated for semantic search
4. Everything is stored in the knowledge graph
5. Summary nodes are created for context

When the agent retrieves memory:

1. Query is embedded
2. Relevant memories are found using:
   - Vector similarity
   - Graph traversal
   - Or both (hybrid)
3. Results are formatted for the LLM
4. Agent uses them to respond

## Architecture

Souvenir is built on:

- **PostgreSQL** - Reliable database
- **pgvector** - Fast vector similarity search
- **chonkiejs** - Smart text chunking
- **Vercel AI SDK** - Agent framework

## Use Cases

Perfect for agents that need to:

- **Remember user preferences** - "I like dark mode"
- **Track ongoing projects** - "Working on Project Apollo"
- **Maintain relationships** - "Alice reports to Bob"
- **Recall past conversations** - "You mentioned your birthday"
- **Build knowledge over time** - Long-term learning

## Not Just Vector Search

Many memory systems only use vector search. Souvenir is different:

| Approach | Strengths | Weaknesses |
|----------|-----------|------------|
| **Vector Only** | Fast, simple | Misses relationships |
| **Graph Only** | Shows connections | Needs exact entities |
| **Souvenir (Hybrid)** | Fast + Connected | Best of both |

The research shows hybrid approaches improve accuracy by 20-40% vs. vector-only systems.

## Research Foundation

Souvenir implements techniques from:

> **"Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning"**
> [arXiv:2505.24478](https://arxiv.org/abs/2505.24478)

## Philosophy

- **Tools-first** - Agents use memory automatically, not manual API calls
- **Research-based** - Built on proven academic techniques
- **Knowledge graphs** - Capture relationships, not just similarity
- **Multi-strategy** - No single retrieval method is always best

