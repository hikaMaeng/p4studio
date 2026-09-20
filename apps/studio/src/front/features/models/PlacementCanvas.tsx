import { Box, Button, CircularProgress, IconButton, Paper, Tooltip, Typography } from "@mui/material";
import { Background, BackgroundVariant, Controls, Handle, MarkerType, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { deployments, graphInventory, type ObservedNodeTarget } from "@p4studio/studio_domain/front";
import { nodeLabelKey, type GraphAgent } from "@p4studio/studio_domain/common";
import type { StudioSnapshot } from "../../../common/domain.js";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { RSC } from "./resource.js";
import { Icon } from "../../shared/components/Icon.js";
import { GraphNameEditor } from "./GraphNameEditor.js";
import { formatMessage } from "../../i18n/format.js";
import { useTheme } from "@mui/material/styles";

type AgentGroupNode = Node<{ agent: GraphAgent; registered: boolean; endpoint: string; empty: boolean; observed: boolean }, "agent-group">;
type ExecutionNode = Node<{ target: ObservedNodeTarget; name: string; observed: boolean; stageIndex: number; layers?: string }, "p4-node">;
type PlacementNode = AgentGroupNode | ExecutionNode;
const groupId = (agentId: string) => `agent:${encodeURIComponent(agentId)}`;
const flowId = (target: Pick<ObservedNodeTarget, "agentId" | "nodeId" | "nodeGeneration">) =>
  `node:${encodeURIComponent(target.agentId)}:${encodeURIComponent(target.nodeId)}:${target.nodeGeneration}`;
const handleId = (target: ObservedNodeTarget) => `${target.agentId}:${target.nodeId}:${target.nodeGeneration}`;

function AgentGroup({ data }: NodeProps<AgentGroupNode>) {
  const { t } = useTranslation();
  const state = useModel(graphInventory.refreshState).value.get(data.agent.id);
  const refreshLabel = `${data.agent.name} ${t[RSC.MODELS_GRAPH_RELOAD_BUTTON]}`;
  return <Paper variant="outlined" data-testid={`flow-agent-${data.agent.id}`} sx={{ width: "100%", height: "100%", bgcolor: "background.default", borderRadius: 2 }}>
    <Box className="agent-drag-handle" data-testid={`flow-agent-header-${data.agent.id}`} sx={{ px: 2.5, py: 1.5, borderBottom: "1px solid", borderColor: "divider", cursor: "grab" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: .5 }}>
        {data.registered ? <GraphNameEditor target={{ kind: "agent", agentId: data.agent.id }} name={data.agent.name} /> : <Typography variant="body2" noWrap title={data.agent.id}>{data.agent.name}</Typography>}
        <Tooltip title={refreshLabel}><span className="nodrag nopan"><IconButton size="small" aria-label={refreshLabel} disabled={!data.registered || state?.busy} onClick={() => void graphInventory.refresh(data.agent)}>
          {state?.busy ? <CircularProgress size={16} aria-label={t[RSC.MODELS_GRAPH_RELOADING_STATUS]} /> : <Icon name="refresh" sx={{ fontSize: 18 }} />}
        </IconButton></span></Tooltip>
      </Box>
      <Typography variant="caption" color="text.secondary" dir="ltr">{data.endpoint}</Typography>
      {state?.error && <Typography role="alert" variant="caption" color="error.main" title={state.error} sx={{ display: "block", mt: .5 }}>{t[RSC.MODELS_GRAPH_RELOAD_ERROR_ALERT]}</Typography>}
      {data.registered && <Button sx={{ display: "flex", mt: .5 }} className="nodrag nopan" size="small" onClick={() => deployments.addStage(data.agent.id)}>{t[RSC.MODELS_ADD_NODE_BUTTON]}</Button>}
    </Box>
    {data.empty && <Typography role="status" sx={{ p: 2, display: "block" }} variant="caption" color="text.secondary">{t[data.observed ? RSC.MODELS_GRAPH_EMPTY_MESSAGE : RSC.MODELS_GRAPH_LOAD_MESSAGE]}</Typography>}
  </Paper>;
}

function P4Node({ data, selected }: NodeProps<ExecutionNode>) {
  const { t } = useTranslation();
  return <Paper variant="outlined" data-testid={`flow-node-${handleId(data.target)}`} sx={{ width: 272, height: 82, display: "grid", alignContent: "center", px: 1.5, borderStyle: data.observed ? "solid" : "dashed", borderColor: selected ? "primary.main" : "text.secondary", bgcolor: selected ? "action.selected" : "background.paper", borderRadius: 1,
    "& .react-flow__handle": { width: 12, height: 12, bgcolor: "background.paper", borderColor: "text.secondary", borderWidth: 2 },
    "& .react-flow__handle:hover": { bgcolor: "primary.main", borderColor: "primary.main" } }}>
    {data.stageIndex >= 0 && <Handle type="target" position={Position.Left} id="input" aria-label={`${data.target.nodeId} ${t[RSC.MODELS_CANVAS_INPUT_LABEL]}`} data-testid={`flow-input-${handleId(data.target)}`} />}
    <GraphNameEditor target={{ kind: "node", agentId: data.target.agentId, nodeId: data.target.nodeId }} name={data.name} />
    <Typography variant="caption" color="text.secondary" noWrap>{data.stageIndex >= 0 ? `${formatMessage(t[RSC.MODELS_STAGE_TEXT], { index: data.stageIndex + 1 })} · ${data.layers}` : data.target.adapterKind}</Typography>
    <Typography variant="caption" color="text.secondary">{t[data.observed ? RSC.MODELS_GRAPH_OBSERVED_STATUS : RSC.MODELS_GRAPH_PLANNED_STATUS]}</Typography>
    {data.stageIndex >= 0 && <Handle type="source" position={Position.Right} id="output" aria-label={`${data.target.nodeId} ${t[RSC.MODELS_CANVAS_OUTPUT_LABEL]}`} data-testid={`flow-output-${handleId(data.target)}`} />}
  </Paper>;
}
const nodeTypes = { "agent-group": AgentGroup, "p4-node": P4Node };

export function PlacementCanvas({ snapshot }: { snapshot: StudioSnapshot }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const input = useModel(deployments.editor).value.input;
  const selectedId = useModel(deployments.selection).value;
  const selected = useModel(deployments.nodeSelection).value;
  const positions = useModel(deployments.agentPositions).value;
  const labels = useModel(graphInventory.labels).value;
  const refreshStates = useModel(graphInventory.refreshState).value;
  const nodes: PlacementNode[] = [];
  const targetsById = new Map<string, ObservedNodeTarget>();
  // See apps/studio/docs/usage.md#model-graph: groups own nodes, never connection ports.
  const plannedAgents = new Set(input.stages.map(stage => stage.agentId));
  const agents = snapshot.agents.map(({ id, name, host, port, inspection }) => ({ id, name, host, port, inspection, registered: true }));
  for (const id of plannedAgents) {
    if (!agents.some(agent => agent.id === id)) agents.push({ id, name: input.stages.find(stage => stage.agentId === id)?.referenceAgent || id || t[RSC.MODELS_UNMAPPED_TEXT], host: "", port: 0, registered: false, inspection: { state: "pending", inspectedAt: null, error: null, snapshot: null } });
  }
  agents.sort((a, b) => {
    const aIndex = input.stages.findIndex(stage => stage.agentId === a.id), bIndex = input.stages.findIndex(stage => stage.agentId === b.id);
    return (aIndex < 0 ? Infinity : aIndex) - (bIndex < 0 ? Infinity : bIndex);
  });
  agents.forEach((agent, agentIndex) => {
    const observed = agent.inspection.snapshot?.nodes ?? [];
    // Configuration survives missing/stale inspection; only exact generations merge.
    const targets = input.stages.filter(stage => stage.agentId === agent.id).map(stage => ({ agentId: agent.id, nodeId: stage.nodeId, nodeGeneration: stage.nodeGeneration, adapterKind: input.adapter }));
    for (const node of observed) {
      const target = { agentId: agent.id, nodeId: node.nodeId, nodeGeneration: node.generation, adapterKind: node.adapterKind };
      if (!targets.some(value => flowId(value) === flowId(target))) targets.push(target);
    }
    const errorHeight = refreshStates.get(agent.id)?.error ? 48 : 0;
    const row = Math.floor(agentIndex / 3);
    const rowHeight = Math.max(240, ...agents.map(value => 112 + (input.stages.filter(stage => stage.agentId === value.id).length + (value.inspection.snapshot?.nodes.length ?? 0)) * 96)) + 64;
    nodes.push({ id: groupId(agent.id), type: "agent-group", data: { agent, registered: agent.registered, endpoint: agent.registered ? `${agent.host}:${agent.port}` : t[RSC.MODELS_UNMAPPED_TEXT], empty: targets.length === 0, observed: agent.inspection.state === "available" },
      position: positions.get(agent.id) ?? { x: (agentIndex % 3) * 416, y: row * rowHeight },
      style: { width: 320, height: Math.max(200, 144 + targets.length * 96) + errorHeight },
      dragHandle: ".agent-drag-handle", connectable: false, selectable: false, deletable: false, ariaLabel: `${t[RSC.MODELS_AGENT_LABEL]} ${agent.name}` });
    targets.forEach((target, index) => {
      targetsById.set(flowId(target), target);
      const name = labels.get(nodeLabelKey(agent.id, target.nodeId))?.name ?? target.nodeId;
      const stageIndex = input.stages.findIndex(stage => flowId(stage) === flowId(target)), stage = input.stages[stageIndex];
      nodes.push({ id: flowId(target), type: "p4-node", parentId: groupId(agent.id), extent: "parent", position: { x: 24, y: 136 + errorHeight + index * 96 },
        data: { target, name, observed: observed.some(node => node.nodeId === target.nodeId && node.generation === target.nodeGeneration), stageIndex, layers: stage ? `[${stage.layerStart}, ${stage.layerEnd})` : undefined }, draggable: false, deletable: false,
        selected: selectedId ? stage?.id === selectedId : selected !== null && flowId(selected) === flowId(target),
        ariaLabel: `${agent.name} / ${target.nodeId}` });
    });
  });
  const edges: Edge[] = input.stages.slice(0, -1).flatMap((stage, index) => {
    const following = input.stages[index + 1]!;
    const source = flowId(stage), target = flowId(following);
    return targetsById.has(source) && targetsById.has(target) ? [{ id: `${stage.id}:${following.id}`, source, target,
      sourceHandle: "output", targetHandle: "input", type: "smoothstep", zIndex: 1, selectable: false, deletable: false,
      ariaLabel: `${stage.nodeId} → ${following.nodeId}`, label: `${index + 1} → ${index + 2}`, markerEnd: { type: MarkerType.ArrowClosed, color: theme.palette.text.secondary }, style: { stroke: theme.palette.text.secondary, strokeWidth: 2.5 }, labelStyle: { fill: theme.palette.text.primary, fontSize: 12 }, labelBgStyle: { fill: theme.palette.background.paper } }] : [];
  });
  const onConnect = (connection: Connection) => {
    const source = targetsById.get(connection.source), target = targetsById.get(connection.target);
    if (source && target) deployments.connectPlannedStages(source, target);
  };
  return <Paper component="section" aria-label={t[RSC.MODELS_CANVAS_LABEL]} variant="outlined" sx={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
    {agents.length === 0 ? <Typography role="status" color="text.secondary" sx={{ p: 3 }}>{t[RSC.MODELS_CANVAS_EMPTY_MESSAGE]}</Typography> :
      <ReactFlow<PlacementNode> key={input.stages.length ? "configured" : "inventory"} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onPaneClick={() => { deployments.selection.set(""); deployments.nodeSelection.set(null); }} onNodesChange={(changes) => {
        const moves = changes.flatMap((change) => {
          if (change.type !== "position" || !change.position) return [];
          const node = nodes.find((item) => item.id === change.id);
          return node?.type === "agent-group" ? [{ agentId: node.data.agent.id, position: change.position }] : [];
        });
        if (moves.length) deployments.agentPositions.mutate((value) => { for (const move of moves) value.set(move.agentId, move.position); });
      }} onConnect={onConnect} onNodeClick={(_event, node) => { if (node.type === "p4-node") deployments.selectObservedNode(node.data.target); }}
        isValidConnection={(connection) => connection.source !== connection.target && input.stages.some(stage => flowId(stage) === connection.source) && input.stages.some(stage => flowId(stage) === connection.target)}
        fitView fitViewOptions={{ padding: .12, maxZoom: 1, nodes: input.stages.length ? [...plannedAgents].map(id => ({ id: groupId(id) })) : undefined }} minZoom={.25} maxZoom={1.8} colorMode="dark" deleteKeyCode={null}>
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
      </ReactFlow>}
  </Paper>;
}
