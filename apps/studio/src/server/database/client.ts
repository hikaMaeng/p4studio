import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AgentProtocolObservation, AgentRecord, ModelRecord, NodeRecord, PipelineRecord, PipelineStageRecord } from "../../common/domain.js";
import type { P4AgentSnapshot } from "@p4studio/p4-protocol";
import { schema } from "./schema.js";
import { AgentGroupRepository } from "./agent-groups.js";
import type { NodeLabel, NodeLabelInput } from "@p4studio/studio_domain/common";

type Row = Record<string, unknown>;

const text = (row: Row, key: string) => String(row[key]);
const nullableText = (row: Row, key: string) => row[key] == null ? null : String(row[key]);
const nullableNumber = (row: Row, key: string) => row[key] == null ? null : Number(row[key]);

/** Owns the SQLite registry and maps snake-case storage rows to the API contract. */
export class StudioDatabase {
  readonly connection: DatabaseSync;
  readonly agentGroups: AgentGroupRepository;

  constructor(path: string) {
    if (path !== ":memory:") {
      const absolute = resolve(path);
      mkdirSync(dirname(absolute), { recursive: true });
      this.connection = new DatabaseSync(absolute);
    } else {
      this.connection = new DatabaseSync(path);
    }
    this.connection.exec(schema);
    this.agentGroups = new AgentGroupRepository(this.connection);
    this.dropLegacyAgentAdapter();
    this.dropLegacyNodeAdapter();
  }

  private dropLegacyAgentAdapter() {
    const columns = this.connection.prepare("SELECT name FROM pragma_table_info('agents')").all() as Row[];
    if (columns.some((column) => text(column, "name") === "adapter")) {
      this.connection.exec("ALTER TABLE agents DROP COLUMN adapter");
    }
  }

  private dropLegacyNodeAdapter() {
    const columns = this.connection.prepare("SELECT name FROM pragma_table_info('nodes')").all() as Row[];
    if (columns.some((column) => text(column, "name") === "adapter")) {
      this.connection.exec("ALTER TABLE nodes DROP COLUMN adapter");
    }
  }

  close() { this.connection.close(); }

  agents(): AgentRecord[] {
    return (this.connection.prepare("SELECT * FROM agents ORDER BY name").all() as Row[]).map((row) => ({
      id: text(row, "id"), name: text(row, "name"), host: text(row, "host"), port: Number(row.port),
      reachability: text(row, "reachability") as AgentRecord["reachability"],
      latencyMs: nullableNumber(row, "latency_ms"), lastProbeAt: nullableText(row, "last_probe_at"),
      probeError: nullableText(row, "probe_error"), createdAt: text(row, "created_at"), updatedAt: text(row, "updated_at"),
    }));
  }

  agent(id: string) { return this.agents().find((agent) => agent.id === id); }

  createAgent(input: { name: string; host: string; port: number }): AgentRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.connection.prepare("INSERT INTO agents (id,name,host,port,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .run(id, input.name, input.host, input.port, now, now);
    return this.agent(id)!;
  }

  updateAgent(id: string, input: { name: string; host: string; port: number }): AgentRecord | undefined {
    const now = new Date().toISOString();
    const result = this.connection.prepare("UPDATE agents SET name=?, host=?, port=?, updated_at=? WHERE id=?")
      .run(input.name, input.host, input.port, now, id);
    return result.changes > 0 ? this.agent(id) : undefined;
  }

  updateProbe(id: string, result: Pick<AgentRecord, "reachability" | "latencyMs" | "probeError">): AgentRecord {
    const now = new Date().toISOString();
    this.connection.prepare("UPDATE agents SET reachability=?, latency_ms=?, probe_error=?, last_probe_at=?, updated_at=? WHERE id=?")
      .run(result.reachability, result.latencyMs, result.probeError, now, now, id);
    return this.agent(id)!;
  }

  renameAgent(id: string, name: string) {
    this.connection.prepare("UPDATE agents SET name=?, updated_at=? WHERE id=?").run(name, new Date().toISOString(), id);
    return this.agent(id);
  }

  agentObservation(agentId: string): AgentProtocolObservation | null {
    const row = this.connection.prepare("SELECT observed_at,snapshot_json FROM agent_observations WHERE agent_id=?").get(agentId) as Row | undefined;
    if (!row) return null;
    try {
      const snapshot = JSON.parse(text(row, "snapshot_json")) as unknown;
      if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
      return { state: "available", inspectedAt: text(row, "observed_at"), error: null, snapshot: snapshot as P4AgentSnapshot };
    } catch { return null; }
  }

  recordAgentObservation(agentId: string, observedAt: string, snapshot: P4AgentSnapshot): AgentProtocolObservation {
    const serialized = JSON.stringify(snapshot);
    this.connection.prepare("INSERT INTO agent_observations (agent_id,observed_at,snapshot_json) VALUES (?,?,?) ON CONFLICT(agent_id) DO UPDATE SET observed_at=excluded.observed_at,snapshot_json=excluded.snapshot_json WHERE excluded.observed_at >= agent_observations.observed_at")
      .run(agentId, observedAt, serialized);
    return this.agentObservation(agentId)!;
  }

  nodeLabels(): NodeLabel[] {
    return (this.connection.prepare("SELECT agent_id,node_id,json_extract(metadata_json,'$.name') AS name,updated_at FROM node_metadata WHERE json_type(metadata_json,'$.name')='text' ORDER BY agent_id,node_id").all() as Row[])
      .map(row => ({ agentId: text(row, "agent_id"), nodeId: text(row, "node_id"), name: text(row, "name"), updatedAt: text(row, "updated_at") }));
  }

  renameNode(agentId: string, input: NodeLabelInput): NodeLabel {
    const result = { agentId, ...input, updatedAt: new Date().toISOString() };
    // Name updates patch one managed field; unrelated Studio metadata survives.
    this.connection.prepare("INSERT INTO node_metadata (agent_id,node_id,metadata_json,updated_at) VALUES (?,?,?,?) ON CONFLICT(agent_id,node_id) DO UPDATE SET metadata_json=json_set(node_metadata.metadata_json,'$.name',json_extract(excluded.metadata_json,'$.name')),revision=node_metadata.revision+1,updated_at=excluded.updated_at")
      .run(agentId, input.nodeId, JSON.stringify({ name: input.name }), result.updatedAt);
    return result;
  }

  deleteAgent(id: string) { return this.connection.prepare("DELETE FROM agents WHERE id=?").run(id).changes > 0; }

  models(): ModelRecord[] {
    return (this.connection.prepare("SELECT * FROM models ORDER BY name").all() as Row[]).map((row) => ({
      id: text(row, "id"), name: text(row, "name"), artifact: text(row, "artifact"), architecture: text(row, "architecture"),
      adapter: text(row, "adapter"), contextLength: nullableNumber(row, "context_length"), notes: text(row, "notes"),
      createdAt: text(row, "created_at"), updatedAt: text(row, "updated_at"),
    }));
  }

  createModel(input: Omit<ModelRecord, "id" | "createdAt" | "updatedAt">): ModelRecord {
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    this.connection.prepare("INSERT INTO models (id,name,artifact,architecture,adapter,context_length,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(id, input.name, input.artifact, input.architecture, input.adapter, input.contextLength, input.notes, now, now);
    return this.models().find((model) => model.id === id)!;
  }

  nodes(): NodeRecord[] {
    return (this.connection.prepare("SELECT * FROM nodes ORDER BY agent_id,name").all() as Row[]).map((row) => ({
      id: text(row, "id"), agentId: text(row, "agent_id"), name: text(row, "name"),
      lifecycle: text(row, "lifecycle") as NodeRecord["lifecycle"], createdAt: text(row, "created_at"),
    }));
  }

  createNode(input: { agentId: string; name: string }): NodeRecord {
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    this.connection.prepare("INSERT INTO nodes (id,agent_id,name,created_at) VALUES (?,?,?,?)")
      .run(id, input.agentId, input.name, now);
    return this.nodes().find((node) => node.id === id)!;
  }

  pipelines(): PipelineRecord[] {
    const stageRows = this.connection.prepare("SELECT * FROM pipeline_stages ORDER BY stage_index").all() as Row[];
    const stages = stageRows.map((row): PipelineStageRecord => ({
      id: text(row, "id"), pipelineId: text(row, "pipeline_id"), nodeId: text(row, "node_id"), stageIndex: Number(row.stage_index),
      layerStart: Number(row.layer_start), layerEnd: Number(row.layer_end), launchArgs: text(row, "launch_args"),
    }));
    return (this.connection.prepare("SELECT * FROM pipelines ORDER BY name").all() as Row[]).map((row) => ({
      id: text(row, "id"), name: text(row, "name"), modelId: text(row, "model_id"),
      status: text(row, "status") as PipelineRecord["status"], createdAt: text(row, "created_at"), updatedAt: text(row, "updated_at"),
      stages: stages.filter((stage) => stage.pipelineId === text(row, "id")),
    }));
  }

  createPipeline(input: { name: string; modelId: string; stages: Array<Omit<PipelineStageRecord, "id" | "pipelineId">> }): PipelineRecord {
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    this.connection.exec("BEGIN");
    try {
      this.connection.prepare("INSERT INTO pipelines (id,name,model_id,created_at,updated_at) VALUES (?,?,?,?,?)").run(id, input.name, input.modelId, now, now);
      const insert = this.connection.prepare("INSERT INTO pipeline_stages (id,pipeline_id,node_id,stage_index,layer_start,layer_end,launch_args) VALUES (?,?,?,?,?,?,?)");
      input.stages.forEach((stage) => insert.run(crypto.randomUUID(), id, stage.nodeId, stage.stageIndex, stage.layerStart, stage.layerEnd, stage.launchArgs));
      this.connection.exec("COMMIT");
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
    return this.pipelines().find((pipeline) => pipeline.id === id)!;
  }
}
