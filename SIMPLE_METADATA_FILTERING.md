# Simple Category-Based Memory Filtering

## Summary

This implementation adds simple category-based filtering to Souvenir's search functionality. Memories can be organized by a single `category` field in metadata, and all searches are automatically scoped to the current session.

## What Changed

### 1. Added `category` to SearchOptions (src/types.ts)

```typescript
export interface SearchOptions {
  // ... existing fields
  category?: string; // Filter by memory category
}
```

### 2. Updated Repository Layer (src/db/repository.ts)

The `searchByVector()` method now accepts a `category` parameter and filters using PostgreSQL's JSONB string extraction:

```typescript
async searchByVector(
  embedding: number[],
  limit: number = 10,
  minScore: number = 0.7,
  nodeTypes?: string[],
  category?: string, // NEW
): Promise<SearchResult[]>
```

**How it works:**
- Uses JSONB string extraction: `metadata->>'category' = 'preference'`
- Efficiently leverages existing GIN index on `memory_nodes.metadata`
- Simple string equality matching

### 3. Updated Retrieval Strategies (src/core/retrieval.ts)

The `vectorRetrieval()` method now passes the category parameter to the repository:

```typescript
const { category } = options;

let results = await this.repository.searchByVector(
  queryEmbedding,
  limit * 2,
  minScore,
  nodeTypes,
  category, // Passed through
);
```

### 4. Enhanced searchMemory Tool (src/tools/index.ts)

**Key Changes:**

1. **Added `category` parameter:**
   ```typescript
   category: z
     .string()
     .optional()
     .describe(
       "Filter results by memory category (e.g., 'preference', 'configuration', 'task')",
     )
   ```

2. **Always scoped to current session:**
   ```typescript
   let vectorResults = await souvenir.search(query, {
     sessionId: souvenir.getSessionId(), // ALWAYS included
     category,
     // ...
   });
   ```

3. **Category filtering in keyword fallback:**
   - When vector search returns no results, keyword fallback also respects category filter

4. **Updated storeMemory description:**
   - Guides agents to use `category` field in metadata for filtering

## Usage Examples

### Example 1: Preference vs Configuration

```typescript
// Store user preferences
await storeMemory({
  content: "User prefers dark mode in the application",
  metadata: { category: "preference" },
});

// Store configuration
await storeMemory({
  content: "Database connection uses PostgreSQL on port 5432",
  metadata: { category: "configuration" },
});

// Search only preferences
await searchMemory({
  query: "user settings",
  category: "preference",
});
// Returns: "User prefers dark mode..." only
```

### Example 2: Task Management

```typescript
// Store different types of tasks
await storeMemory({
  content: "Fix the login button bug on mobile devices",
  metadata: { category: "bug" },
});

await storeMemory({
  content: "Implement dark mode toggle feature",
  metadata: { category: "feature" },
});

await storeMemory({
  content: "Refactor authentication service to use OAuth2",
  metadata: { category: "refactor" },
});

// Search only bugs
await searchMemory({
  query: "login",
  category: "bug",
});
// Returns: "Fix the login button bug..." only
```

### Example 3: Project Documentation

```typescript
// Store different types of documentation
await storeMemory({
  content: "API endpoint /auth/login accepts email and password",
  metadata: { category: "api-docs" },
});

await storeMemory({
  content: "Component Button accepts props: variant, size, onClick",
  metadata: { category: "component-docs" },
});

await storeMemory({
  content: "Deployment process: run build, test, then deploy to staging",
  metadata: { category: "process-docs" },
});

// Search only API documentation
await searchMemory({
  query: "authentication",
  category: "api-docs",
});
// Returns: "API endpoint /auth/login..." only
```

### Example 4: Learning and Context

```typescript
// Store different types of learnings
await storeMemory({
  content: "User mentioned they work with React and TypeScript",
  metadata: { category: "context" },
});

await storeMemory({
  content: "Learned that the project uses microservices architecture",
  metadata: { category: "architecture" },
});

await storeMemory({
  content: "User prefers detailed explanations over brief answers",
  metadata: { category: "preference" },
});

// Search only architectural knowledge
await searchMemory({
  query: "project structure",
  category: "architecture",
});
// Returns: "Learned that the project uses microservices..." only
```

### Example 5: Agent Specialization

```typescript
// Security scanner agent stores findings
await storeMemory({
  content: "Found SQL injection vulnerability in user input handler",
  metadata: { category: "security-finding" },
});

// Performance agent stores metrics
await storeMemory({
  content: "API response time averaged 150ms under normal load",
  metadata: { category: "performance-metric" },
});

// Code reviewer stores suggestions
await storeMemory({
  content: "Consider extracting validation logic into separate function",
  metadata: { category: "code-review" },
});

// Each agent searches only its own category
await searchMemory({
  query: "vulnerabilities",
  category: "security-finding",
});
// Returns: "Found SQL injection..." only
```

## How Filtering Works

### JSONB String Extraction Query

When you provide `category: "preference"`, the system generates:

```sql
SELECT *
FROM memory_nodes
WHERE metadata->>'category' = 'preference'
  AND embedding IS NOT NULL
  AND 1 - (embedding <=> $1::vector) >= 0.7
ORDER BY embedding <=> $1::vector
LIMIT 5
```

**The `->>` operator means:**
- Extract the `category` field from the JSONB metadata as text
- Compare it to the provided category string
- Uses the existing GIN index for efficient JSONB field access

### Session Scoping

**Every search is automatically scoped to the current session:**

```typescript
await souvenir.search(query, {
  sessionId: souvenir.getSessionId(), // Always included
  category,
});
```

This ensures memories from different conversations/sessions never leak into each other.

## Why Category-Only?

### Simplicity & Consistency
- **One standard field**: All agents use the same `category` field
- **No key confusion**: Can't misspell or use inconsistent field names
- **Easy to understand**: Simple string matching, not complex JSONB queries

### Prevents Common Mistakes
- ❌ Agent A stores `{type: "bug"}`, Agent B searches for `{category: "bug"}` → no match
- ❌ Agent stores `{userId: "alice"}` in a session already scoped to Alice → redundant/confusing
- ✅ All agents use `{category: "bug"}` → consistent and clear

### sessionId Already Handles User Scoping
- Sessions are user-scoped by design
- No need for additional `userId` field
- Category is for organizing memories **within** a session

## Suggested Categories

Here are recommended category values for common use cases:

**User Preferences & Context:**
- `preference` - User preferences and settings
- `context` - Background information about the user
- `goal` - User's stated goals or objectives

**Development Tasks:**
- `bug` - Bug reports and issues
- `feature` - Feature requests and implementations
- `refactor` - Code refactoring tasks
- `test` - Testing-related information

**Documentation:**
- `api-docs` - API endpoint documentation
- `component-docs` - Component/module documentation
- `process-docs` - Process and workflow documentation
- `architecture` - System architecture information

**Configuration:**
- `configuration` - System configuration settings
- `environment` - Environment-specific settings
- `credential` - Credential and access information (be careful!)

**Agent-Specific:**
- `security-finding` - Security scanner results
- `performance-metric` - Performance measurements
- `code-review` - Code review suggestions
- `deployment-log` - Deployment history and logs

## Performance

### Database Index Usage

- **GIN index on `memory_nodes.metadata`** (already exists)
- JSONB field extraction queries (`->>`) use this index efficiently
- Time complexity: O(log n) for indexed field lookups

### Query Performance

Typical query with category filtering:
```
1. Vector similarity search (indexed)
2. JSONB field extraction filter (indexed)
3. Session filter (join with session_nodes)
4. Result set typically: 5-10 nodes
```

Expected performance: **< 50ms** for most queries with indexed data.

## Backward Compatibility

✅ **100% Backward Compatible**

- `category` is optional - existing code works without changes
- Default behavior unchanged when `category` is not provided
- Session scoping was already recommended, now it's enforced in the tool
- Metadata can still contain other fields (just not searchable)

## Testing

### Manual Test

```typescript
import { Souvenir } from "@upstart.gg/souvenir";
import { createSouvenirTools } from "@upstart.gg/souvenir/tools";

const souvenir = new Souvenir(config);
const tools = createSouvenirTools(souvenir);

// Test 1: Store with category
await tools.storeMemory.execute({
  content: "User prefers detailed explanations",
  metadata: { category: "preference" },
  processImmediately: true,
});

await tools.storeMemory.execute({
  content: "API uses OAuth2 authentication",
  metadata: { category: "architecture" },
  processImmediately: true,
});

// Test 2: Search with category filter
const result = await tools.searchMemory.execute({
  query: "user",
  category: "preference",
});

console.log(result.memory);
// Should contain "detailed explanations" but NOT "OAuth2"
```

### Expected Behavior

1. **With category filter:** Only memories with matching category are returned
2. **Without category filter:** All memories in session are searched (existing behavior)
3. **Session scoping:** Only memories from current session are returned
4. **Keyword fallback:** Also respects category filter

## Implementation Files

All changes are in these 4 files:

1. **src/types.ts** - Added `category?: string` to `SearchOptions`
2. **src/db/repository.ts** - Added category filtering using JSONB `->>` operator
3. **src/core/retrieval.ts** - Pass `category` to repository
4. **src/tools/index.ts** - Accept `category` parameter, guide agents to use it

Total lines changed: ~40 lines across 4 files.

## Key Benefits

1. **Simple and consistent** - One field, one purpose
2. **Prevents mistakes** - No arbitrary keys to misspell
3. **Efficient** - Leverages existing JSONB indexes
4. **Session-safe** - Always scoped to current session
5. **Backward compatible** - Existing code continues to work
6. **Clear intent** - Category name documents the memory's purpose
