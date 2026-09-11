import { Box, Paper, Typography } from "@mui/material";
import { Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { deployments, type ObservedNodeTarget } from "@p4studio/studio_domain/front";
import type { StudioSnapshot } from "../../../common/domain.js";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { RSC } from "./resource.js";

type AgentGroupNode = Node<{ agentId: string; name: string; endpoint: string; empty: boolean }, "agent-group">;
type ExecutionNode = Node<{ target: ObservedNodeTarget }, "p4-node">;
type PlacementNode = AgentGroupNode | ExecutionNode;
const groupId = (agentId: string) => `agent:${encodeURIComponent(agentId)}`;
const flowId = (target: Pick<ObservedNodeTarget, "agentId" | "nodeId" | "nodeGeneration">) =>
  `node:${encodeURIComponent(target.agentId)}:${encodeURIComponent(target.nodeId)}:${target.nodeGeneration}`;
const handleId = (target: ObservedNodeTarget) => `${target.agentId}:${target.nodeId}:${target.nodeGeneration}`;

function AgentGroup({ data }: NodeProps<AgentGroupNode>) {
  const { t } = useTranslation();
  return <Paper variant="outlined" data-testid={`flow-agent-${data.agentId}`} sx={{ width: "100%", height: "100%", bgcolor: "background.default", borderRadius: 2 }}>
    <Box className="agent-drag-handle" data-testid={`flow-agent-header-${data.agentId}`} sx={{ px: 2.5, py: 1.5, borderBottom: "1px solid", borderColor: "divider", cursor: "grab" }}>
      <Typography component="h3" variant="subtitle2">{data.name}</Typography>
      <Typography variant="caption" color="text.secondary" dir="ltr">{data.endpoint}</Typography>
    </Box>
    {data.empty && <Typography sx={{ p: 2 }} variant="caption" color="text.secondary">{t[RSC.MODELS_CANVAS_EMPTY_MESSAGE]}</Typography>}
  </Paper>;
}

function P4Node({ data, selected }: NodeProps<ExecutionNode>) {
  const { t } = useTranslation();
  return <Paper variant="outlined" data-testid={`flow-node-${handleId(data.target)}`} sx={{ width: 232, height: 44, display: "flex", alignItems: "center", px: 2, borderColor: selected ? "primary.main" : "divider", bgcolor: selected ? "action.selected" : "background.paper", borderRadius: 1,
    "& .react-flow__handle": { width: 12, height: 12, bgcolor: "background.paper", borderColor: "text.secondary", borderWidth: 2 },
    "& .react-flow__handle:hover": { bgcolor: "primary.main", borderColor: "primary.main" } }}>
    <Handle type="target" position={Position.Left} id="input" aria-label={`${data.target.nodeId} ${t[RSC.MODELS_CANVAS_INPUT_LABEL]}`} data-testid={`flow-input-${handleId(data.target)}`} />
    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{data.target.nodeId}</Typography>
    <Handle type="source" position={Position.Right} id="output" aria-label={`${data.target.nodeId} ${t[RSC.MODELS_CANVAS_OUTPUT_LABEL]}`} data-testid={`flow-output-${handleId(data.target)}`} />
  </Paper>;
}
const nodeTypes = { "agent-group": AgentGroup, "p4-node": P4Node };

export function PlacementCanvas({ snapshot }: { snapshot: StudioSnapshot }) {
  const { t } = useTranslation();
  const input = useModel(deployments.editor).value.input;
  const selected = useModel(deployments.nodeSelection).value;
  const positions = useModel(deployments.agentPositions).value;
  const nodes: PlacementNode[] = [];
  const targetsById = new Map<string, ObservedNodeTarget>();
  // See apps/studio/docs/usage.md#model-graph: groups own nodes, never connection ports.
  snapshot.agents.forEach((agent, agentIndex) => {
    const observed = agent.inspection.snapshot?.nodes ?? [];
    nodes.push({ id: groupId(agent.id), type: "agent-group", data: { agentId: agent.id, name: agent.name, endpoint: `${agent.host}:${agent.port}`, empty: observed.length === 0 },
      position: positions.get(agent.id) ?? { x: (agentIndex % 3) * 400, y: Math.floor(agentIndex / 3) * 420 + (agentIndex % 3) * 60 },
      style: { width: 280, height: Math.max(156, 96 + observed.length * 64) },
      dragHandle: ".agent-drag-handle", connectable: false, selectable: false, deletable: false, ariaLabel: `${t[RSC.MODELS_AGENT_LABEL]} ${agent.name}` });
    observed.forEach((node, index) => {
      const target = { agentId: agent.id, nodeId: node.nodeId, nodeGeneration: node.generation, adapterKind: node.adapterKind };
      targetsById.set(flowId(target), target);
      nodes.push({ id: flowId(target), type: "p4-node", parentId: groupId(agent.id), extent: "parent", position: { x: 24, y: 88 + index * 64 },
        data: { target }, draggable: false, deletable: false, selected: selected !== null && flowId(selected) === flowId(target),
        ariaLabel: `${agent.name} / ${node.nodeId}` });
    });
  });
  const edges: Edge[] = input.stages.slice(0, -1).flatMap((stage, index) => {
    const following = input.stages[index + 1]!;
    const source = flowId(stage), target = flowId(following);
    return targetsById.has(source) && targetsById.has(target) ? [{ id: `${stage.id}:${following.id}`, source, target,
      sourceHandle: "output", targetHandle: "input", type: "smoothstep", zIndex: 1, selectable: false, deletable: false,
      ariaLabel: `${stage.nodeId} → ${following.nodeId}`, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }] : [];
  });
  const onConnect = (connection: Connection) => {
    const source = targetsById.get(connection.source), target = targetsById.get(connection.target);
    if (source && target) deployments.connectObservedNodes(source, target);
  };
  return <Paper component="section" aria-label={t[RSC.MODELS_CANVAS_LABEL]} variant="outlined" sx={{ height: "100%", minHeight: 560, overflow: "hidden" }}>
    {snapshot.agents.length === 0 ? <Typography role="status" color="text.secondary" sx={{ p: 3 }}>{t[RSC.MODELS_CANVAS_EMPTY_MESSAGE]}</Typography> :
      <ReactFlow<PlacementNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={(changes) => {
        const moves = changes.flatMap((change) => {
          if (change.type !== "position" || !change.position) return [];
          const node = nodes.find((item) => item.id === change.id);
          return node?.type === "agent-group" ? [{ agentId: node.data.agentId, position: change.position }] : [];
        });
        if (moves.length) deployments.agentPositions.mutate((value) => { for (const move of moves) value.set(move.agentId, move.position); });
      }} onConnect={onConnect} onNodeClick={(_event, node) => { if (node.type === "p4-node") deployments.selectObservedNode(node.data.target); }}
        isValidConnection={(connection) => connection.source !== connection.target && targetsById.has(connection.source) && targetsById.has(connection.target)}
        fitView fitViewOptions={{ padding: .2, maxZoom: 1 }} minZoom={.25} maxZoom={1.8} colorMode="dark" deleteKeyCode={null}>
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>}
  </Paper>;
}
