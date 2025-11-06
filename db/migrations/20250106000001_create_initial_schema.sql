-- migrate:up

-- Enable pgvector extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pg_trgm for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Memory nodes table: stores individual memory units
CREATE TABLE memory_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI ada-002 embedding dimension
  metadata JSONB DEFAULT '{}',
  node_type VARCHAR(50) NOT NULL DEFAULT 'memory',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Memory relationships table: stores connections between memory nodes
CREATE TABLE memory_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  relationship_type VARCHAR(100) NOT NULL,
  weight FLOAT DEFAULT 1.0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT different_nodes CHECK (source_id != target_id)
);

-- Memory sessions table: groups related memories
CREATE TABLE memory_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_name VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Session nodes junction table
CREATE TABLE session_nodes (
  session_id UUID NOT NULL REFERENCES memory_sessions(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (session_id, node_id)
);

-- Memory chunks table: stores document chunks before cognification
CREATE TABLE memory_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  source_identifier VARCHAR(500),
  metadata JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_memory_nodes_embedding ON memory_nodes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_memory_nodes_type ON memory_nodes(node_type);
CREATE INDEX idx_memory_nodes_created_at ON memory_nodes(created_at DESC);
CREATE INDEX idx_memory_nodes_metadata ON memory_nodes USING gin(metadata);

CREATE INDEX idx_memory_relationships_source ON memory_relationships(source_id);
CREATE INDEX idx_memory_relationships_target ON memory_relationships(target_id);
CREATE INDEX idx_memory_relationships_type ON memory_relationships(relationship_type);

CREATE INDEX idx_session_nodes_session ON session_nodes(session_id);
CREATE INDEX idx_session_nodes_node ON session_nodes(node_id);

CREATE INDEX idx_memory_chunks_source ON memory_chunks(source_identifier);
CREATE INDEX idx_memory_chunks_processed ON memory_chunks(processed) WHERE processed = FALSE;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_memory_nodes_updated_at
  BEFORE UPDATE ON memory_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memory_sessions_updated_at
  BEFORE UPDATE ON memory_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- migrate:down

DROP TRIGGER IF EXISTS update_memory_sessions_updated_at ON memory_sessions;
DROP TRIGGER IF EXISTS update_memory_nodes_updated_at ON memory_nodes;
DROP FUNCTION IF EXISTS update_updated_at_column();

DROP TABLE IF EXISTS session_nodes;
DROP TABLE IF EXISTS memory_chunks;
DROP TABLE IF EXISTS memory_relationships;
DROP TABLE IF EXISTS memory_sessions;
DROP TABLE IF EXISTS memory_nodes;

DROP EXTENSION IF EXISTS pg_trgm;
DROP EXTENSION IF EXISTS vector;
