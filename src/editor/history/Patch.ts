import type {
  FlowGraphV1,
  FlowNodeV1,
  FlowEdgeV1,
} from "../../runtime/workerProtocol";

export type Patch =
  | { type: "add-node"; node: FlowNodeV1 }
  | {
      type: "delete-node";
      node: FlowNodeV1;
      relatedEdges: FlowEdgeV1[];
    }
  | {
      type: "update-node";
      id: string;
      before: Partial<FlowNodeV1>;
      after: Partial<FlowNodeV1>;
    }
  | {
      type: "move-node";
      id: string;
      before: FlowNodeV1["position"];
      after: FlowNodeV1["position"];
    }
  | { type: "add-edge"; edge: FlowEdgeV1 }
  | { type: "delete-edge"; edge: FlowEdgeV1 }
  | {
      type: "update-edge";
      id: string;
      before: Partial<FlowEdgeV1>;
      after: Partial<FlowEdgeV1>;
    };

export function applyPatch(g: FlowGraphV1, p: Patch) {
  switch (p.type) {
    case "add-node": {
      const exists = g.nodes.some((n) => n.id === p.node.id);
      if (!exists) g.nodes.push(structuredClone(p.node));
      break;
    }

    case "delete-node": {
      g.nodes = g.nodes.filter((n) => n.id !== p.node.id);
      g.edges = g.edges.filter(
        (e) => e.from !== p.node.id && e.to !== p.node.id
      );
      break;
    }

    case "update-node": {
      const n = g.nodes.find((n) => n.id === p.id);
      if (!n) break;
      Object.assign(n, structuredClone(p.after));
      break;
    }

    case "move-node": {
      const n = g.nodes.find((n) => n.id === p.id);
      if (!n) break;
      n.position = structuredClone(p.after);
      break;
    }

    case "add-edge": {
      const exists = g.edges.some((e) => e.id === p.edge.id);
      if (!exists) g.edges.push(structuredClone(p.edge));
      break;
    }

    case "delete-edge": {
      g.edges = g.edges.filter((e) => e.id !== p.edge.id);
      break;
    }

    case "update-edge": {
      const e = g.edges.find((e) => e.id === p.id);
      if (!e) break;
      Object.assign(e, structuredClone(p.after));
      break;
    }
  }
}

export function revertPatch(g: FlowGraphV1, p: Patch) {
  switch (p.type) {
    case "add-node": {
      g.nodes = g.nodes.filter((n) => n.id !== p.node.id);
      break;
    }

    case "delete-node": {
      // restore node
      if (!g.nodes.some((n) => n.id === p.node.id)) {
        g.nodes.push(structuredClone(p.node));
      }

      // restore edges (dedupe)
      for (const e of p.relatedEdges) {
        if (!g.edges.some((x) => x.id === e.id)) {
          g.edges.push(structuredClone(e));
        }
      }

      break;
    }

    case "update-node": {
      const n = g.nodes.find((n) => n.id === p.id);
      if (!n) break;
      Object.assign(n, structuredClone(p.before));
      break;
    }

    case "move-node": {
      const n = g.nodes.find((n) => n.id === p.id);
      if (!n) break;
      n.position = structuredClone(p.before);
      break;
    }

    case "add-edge": {
      g.edges = g.edges.filter((e) => e.id !== p.edge.id);
      break;
    }

    case "delete-edge": {
      if (!g.edges.some((e) => e.id === p.edge.id)) {
        g.edges.push(structuredClone(p.edge));
      }
      break;
    }

    case "update-edge": {
      const e = g.edges.find((e) => e.id === p.id);
      if (!e) break;
      Object.assign(e, structuredClone(p.before));
      break;
    }
  }
}
