import type { FlowNodeV1 } from "../../../runtime/workerProtocol";
import type { Command } from "../Command";
import { BaseCommand } from "../Command";

/**
 * Update node properties (label / position / etc.)
 * - 支持 merge（连续输入）
 */
export class UpdateNodeCommand extends BaseCommand {
  readonly nodeId: string;

  constructor(
    nodeId: string,
    before: Partial<FlowNodeV1>,
    after: Partial<FlowNodeV1>
  ) {
    super("Update Node", [
      {
        type: "update-node",
        id: nodeId,
        before: structuredClone(before),
        after: structuredClone(after),
      },
    ]);

    this.nodeId = nodeId;
  }

  merge(next: Command): boolean {
    if (!(next instanceof UpdateNodeCommand)) return false;
    if (next.nodeId !== this.nodeId) return false;

    // 合并：保留最早 before，更新 after
    this.patches[0] = {
      ...this.patches[0],
      after: structuredClone(next.patches[0].after),
    };

    return true;
  }
}
