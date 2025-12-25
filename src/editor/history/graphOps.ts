import type { FlowEdgeV1, FlowGraphV1, FlowNodeV1 } from '../../runtime/workerProtocol';

export function addBasicNode(g: FlowGraphV1, node: FlowNodeV1) {
  g.nodes.push(node);
}

export function addRouterNode(g: FlowGraphV1, node: FlowNodeV1) {
  g.nodes.push(node);
}

export function updateNode(g: FlowGraphV1, id: string, patch: Partial<FlowNodeV1>) {
  const n = g.nodes.find(n => n.id === id);
  if (!n) return;

  if (patch.label !== undefined) n.label = patch.label;
  if (patch.position) n.position = patch.position;
  if (patch.type) n.type = patch.type;

}

export function addEdge(g: FlowGraphV1, edge: FlowEdgeV1) {
  g.edges.push(edge);
}

export function deleteEdge(g: FlowGraphV1, edgeId: string) {
  g.edges = g.edges.filter(e => e.id !== edgeId);
}

export function deleteNodeWithTopology(g: FlowGraphV1, nodeId: string) {
  // 1) remove node
  g.nodes = g.nodes.filter(n => n.id !== nodeId);

  // 2) remove edges connected
  g.edges = g.edges.filter(e => e.from !== nodeId && e.to !== nodeId);

}
