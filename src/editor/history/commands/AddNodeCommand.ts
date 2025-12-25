import type { FlowNodeV1 } from "../../../runtime/workerProtocol";
import { BaseCommand } from "../Command";

/**
 * Add node
 * - 只负责“节点存在性”
 * - position / label 的后续变化必须由 Move / Update 负责
 */
export class AddNodeCommand extends BaseCommand {
  readonly nodeId: string;

  constructor(node: FlowNodeV1) {
    super("Add Node", [
      {
        type: "add-node",
        node: structuredClone(node),
      },
    ]);

    this.nodeId = node.id;
  }
}
