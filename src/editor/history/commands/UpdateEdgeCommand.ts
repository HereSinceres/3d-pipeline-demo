import type { FlowEdgeV1 } from "../../../runtime/workerProtocol";
import type { Command } from "../Command";
import { BaseCommand } from "../Command";

/**
 * Update edge properties
 * - 支持 merge（拖 slider / 连续输入）
 */
export class UpdateEdgeCommand extends BaseCommand {
  readonly edgeId: string;

  constructor(
    edgeId: string,
    before: Partial<FlowEdgeV1>,
    after: Partial<FlowEdgeV1>
  ) {
    super("Update Edge", [
      {
        type: "update-edge",
        id: edgeId,
        before: structuredClone(before),
        after: structuredClone(after),
      },
    ]);

    this.edgeId = edgeId;
  }

  merge(next: Command): boolean {
    if (!(next instanceof UpdateEdgeCommand)) return false;
    if (next.edgeId !== this.edgeId) return false;

    // 保留最早 before，更新 after
    this.patches[0] = {
      ...this.patches[0],
      after: structuredClone((next.patches[0] as any).after),
    };

    return true;
  }
}
