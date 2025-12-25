import type {
  FlowGraphV1,
  FlowNodeV1,
  FlowEdgeV1,
} from "../../../runtime/workerProtocol";
import { BaseCommand } from "../Command";

/**
 * Delete node with topology cleanup
 * - 自动携带相关 edge
 * - undo 时完整恢复
 */
export class DeleteNodeCommand extends BaseCommand {
  readonly nodeId: string;

  constructor(graph: FlowGraphV1, nodeId: string) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error(`DeleteNodeCommand: node ${nodeId} not found`);
    }

    const relatedEdges: FlowEdgeV1[] = graph.edges.filter(
      (e) => e.from === nodeId || e.to === nodeId
    );

    super("Delete Node", [
      {
        type: "delete-node",
        node: structuredClone(node),
        relatedEdges: structuredClone(relatedEdges),
      },
    ]);

    this.nodeId = nodeId;
  }
}
