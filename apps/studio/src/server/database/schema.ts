// Managed metadata ownership and extension rules: apps/studio/docs/usage.md#managed-metadata.
export const schema = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    host TEXT NOT NULL,
    port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
    reachability TEXT NOT NULL DEFAULT 'unknown' CHECK (reachability IN ('unknown', 'reachable', 'unreachable')),
    latency_ms INTEGER,
    last_probe_at TEXT,
    probe_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(host, port)
  );

  CREATE TABLE IF NOT EXISTS node_metadata (
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    revision INTEGER NOT NULL DEFAULT 1,
    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (agent_id, node_id)
  );

  -- A browser-authored, timestamped P4 INSPECT result.  This is historical
  -- evidence for the registered endpoint, not a declaration or current state.
  CREATE TABLE IF NOT EXISTS agent_observations (
    agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    observed_at TEXT NOT NULL,
    snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json))
  );

  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    artifact TEXT NOT NULL,
    architecture TEXT NOT NULL,
    adapter TEXT NOT NULL,
    context_length INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    lifecycle TEXT NOT NULL DEFAULT 'declared' CHECK (lifecycle IN ('declared', 'loading', 'ready', 'error')),
    created_at TEXT NOT NULL,
    UNIQUE(agent_id, name)
  );

  CREATE TABLE IF NOT EXISTS pipelines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    model_id TEXT NOT NULL REFERENCES models(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'loading', 'ready', 'error')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pipeline_stages (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE RESTRICT,
    stage_index INTEGER NOT NULL CHECK (stage_index >= 0),
    layer_start INTEGER NOT NULL CHECK (layer_start >= 0),
    layer_end INTEGER NOT NULL CHECK (layer_end > layer_start),
    launch_args TEXT NOT NULL DEFAULT '{}',
    UNIQUE(pipeline_id, stage_index)
  );
`;
