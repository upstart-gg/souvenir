# Retrieval Strategies

Souvenir supports five retrieval strategies based on research from ["Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning"](https://arxiv.org/abs/2505.24478).

## Overview

| Strategy | Use Case | Pros | Cons |
|----------|----------|------|------|
| **Vector** | Semantic search | Fast, good for similarity | Misses relationships |
| **Graph Neighborhood** | Find related entities | Shows connections | Limited by graph size |
| **Graph Completion** | Complex reasoning | Structured context | Requires good graph |
| **Graph Summary** | High-level context | Efficient for overview | Less detailed |
| **Hybrid** | Best of both | Balanced results | More computation |

## Vector Retrieval

Traditional semantic search using embeddings.

### Usage

```typescript
const results = await souvenir.search('What is the capital of France?', {
  strategy: 'vector',
  topK: 5,
  sessionId: 'user-123',
});

for (const result of results) {
  console.log(`Score: ${result.score}`);
  console.log(`Content: ${result.node.content}`);
}
```

### How It Works

1. Generate embedding for query
2. Find nearest neighbors using cosine similarity
3. Return top-K results ranked by similarity

### Best For

- Quick semantic search
- Finding similar content
- When relationships don't matter
- Simple Q&A

### Parameters

```typescript
{
  strategy: 'vector',
  topK: 5,              // Number of results
  minScore: 0.7,        // Minimum similarity score
  sessionId: 'user-123' // Optional: filter by session
}
```

## Graph Neighborhood Retrieval

Retrieve entities and their immediate neighbors from the knowledge graph.

### Usage

```typescript
const results = await souvenir.search('Tell me about the Eiffel Tower', {
  strategy: 'graph-neighborhood',
  topK: 3,
  traversalDepth: 2, // How many hops
});

// Results include connected entities
for (const result of results) {
  console.log(`Entity: ${result.node.content}`);
  console.log(`Neighbors: ${result.neighbors?.length}`);
}
```

### How It Works

1. Find relevant entities using vector search
2. Traverse graph to find neighbors (1-2 hops)
3. Return entities with their connections
4. Include relationship types and weights

### Best For

- Exploring relationships
- Finding connected information
- Understanding entity context
- Building knowledge maps

### Parameters

```typescript
{
  strategy: 'graph-neighborhood',
  topK: 3,
  traversalDepth: 2,     // Number of hops (1-3)
  minRelationshipWeight: 0.5, // Filter weak connections
  sessionId: 'user-123'
}
```

## Graph Completion Retrieval

Format graph triplets (subject-predicate-object) for LLM reasoning.

### Usage

```typescript
const results = await souvenir.search('Who designed the Eiffel Tower?', {
  strategy: 'graph-completion',
  topK: 5,
  formatForLLM: true, // Format as triplets
});

// Get formatted context
const context = await souvenir.searchGraph('Who designed the Eiffel Tower?', {
  topK: 5,
});

console.log(context.content);
// Output:
// **Node**: Eiffel Tower
// - located_in → Paris (weight: 0.95)
// - designed_by → Gustave Eiffel (weight: 0.98)
// - completed_in → 1889 (weight: 0.92)
```

### How It Works

1. Find relevant entities
2. Extract relationship triplets
3. Format as structured text for LLM
4. Group by relationship type

### Best For

- Complex reasoning tasks
- Multi-hop questions
- When LLM needs structured data
- Fact verification

### Parameters

```typescript
{
  strategy: 'graph-completion',
  topK: 5,
  formatForLLM: true,    // Format triplets
  includeWeights: true,  // Show relationship confidence
  sessionId: 'user-123'
}
```

## Graph Summary Retrieval

Use summary nodes for high-level context.

### Usage

```typescript
const results = await souvenir.search('Give me an overview of Paris', {
  strategy: 'graph-summary',
  topK: 3,
});

for (const result of results) {
  console.log(result.node.content); // Summary text
}
```

### How It Works

1. Find relevant summary nodes
2. Return session or subgraph summaries
3. Provide high-level context

### Best For

- Quick overviews
- Long documents
- Session context
- Reducing token usage

### Parameters

```typescript
{
  strategy: 'graph-summary',
  topK: 3,
  summaryType: 'session', // or 'subgraph'
  sessionId: 'user-123'
}
```

## Hybrid Retrieval

Combine vector and graph retrieval for best results.

### Usage

```typescript
const context = await souvenir.searchHybrid('Tell me about Paris landmarks', {
  topK: 5,
  vectorWeight: 0.6,  // 60% vector, 40% graph
  sessionId: 'user-123',
});

console.log(context.type); // 'hybrid'
console.log(context.content); // Combined formatted context
```

### How It Works

1. Run vector search
2. Run graph traversal
3. Merge and re-rank results
4. Format combined context

### Best For

- General-purpose retrieval
- When you want both similarity and relationships
- Production applications
- Balanced performance/quality

### Parameters

```typescript
{
  strategy: 'hybrid',
  topK: 5,
  vectorWeight: 0.6,     // Vector contribution (0-1)
  graphWeight: 0.4,      // Graph contribution (0-1)
  formatForLLM: true,    // Format output
  sessionId: 'user-123'
}
```

## Comparison Example

Let's compare all strategies for the same query:

```typescript
const query = 'What do you know about the Eiffel Tower?';
const sessionId = 'demo';

// Vector: Fast semantic search
const vector = await souvenir.search(query, {
  strategy: 'vector',
  topK: 3,
  sessionId,
});
// Returns: Similar chunks about Eiffel Tower

// Graph Neighborhood: Show connections
const neighborhood = await souvenir.search(query, {
  strategy: 'graph-neighborhood',
  topK: 3,
  sessionId,
});
// Returns: Eiffel Tower + connected entities (Paris, Gustave Eiffel, France)

// Graph Completion: Structured triplets
const completion = await souvenir.searchGraph(query, {
  topK: 3,
  sessionId,
});
// Returns: Formatted triplets for LLM reasoning

// Graph Summary: High-level overview
const summary = await souvenir.search(query, {
  strategy: 'graph-summary',
  topK: 2,
  sessionId,
});
// Returns: Summary nodes with high-level context

// Hybrid: Best of both worlds
const hybrid = await souvenir.searchHybrid(query, {
  topK: 5,
  sessionId,
});
// Returns: Combined vector + graph results
```

## Choosing a Strategy

### Use Vector When:
- You need fast similarity search
- Relationships aren't important
- You have simple Q&A
- You want low latency

### Use Graph Neighborhood When:
- You need to show connections
- Context requires related entities
- You're building knowledge maps
- You want to explore relationships

### Use Graph Completion When:
- You need structured reasoning
- LLM needs triplet format
- You have multi-hop questions
- You want explicit relationships

### Use Graph Summary When:
- You need high-level overview
- You want to reduce tokens
- You're working with long content
- Speed is critical

### Use Hybrid When:
- You want balanced results
- You're not sure which to use
- Quality is more important than speed
- You need production reliability

## Research Background

These strategies are based on research from the paper:

> **"Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning"**
> [arXiv:2505.24478](https://arxiv.org/abs/2505.24478)

Key findings:
- **Graph-completion** outperforms pure vector search by 15-20%
- **Summary nodes** reduce retrieval time by 40%
- **Hybrid retrieval** provides best overall performance
- **Top-K = 5** is optimal for most tasks

## Next Steps

- [ETL Pipeline](/guide/etl-pipeline) - How data flows
- [Chunking](/guide/chunking) - Text chunking options
- [Quick Start](/guide/quick-start) - Get started

````
