import type { FlowNodeV1 } from '../../../runtime/workerProtocol';
import type { Command } from '../Command';
import { BaseCommand } from '../Command';

/**
 * Move node
 * - before / after 必须在构造时就冻结
 * - merge：同一 node 的连续移动只保留一条历史
 */
export class MoveNodeCommand extends BaseCommand {
  readonly nodeId: string;

  constructor(
    nodeId: string,
    before: FlowNodeV1['position'],
    after: FlowNodeV1['position']
  ) {
    super('Move Node', [
      {
        type: 'move-node',
        id: nodeId,
        before: structuredClone(before),
        after: structuredClone(after),
      },
    ]);

    this.nodeId = nodeId;
  }

  merge(next: Command): boolean {
    if (!(next instanceof MoveNodeCommand)) return false;
    if (next.nodeId !== this.nodeId) return false;

    // ⭐ 合并规则：
    // - 保留最早 before
    // - 用最新 after
    this.patches[0] = {
      ...this.patches[0],
      after: structuredClone(next.patches[0].after),
    };

    return true;
  }
}
