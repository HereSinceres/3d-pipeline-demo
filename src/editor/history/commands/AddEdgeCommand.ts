import type { FlowEdgeV1 } from '../../../runtime/workerProtocol';
import { BaseCommand } from '../Command';

/**
 * Add edge
 * - 不 merge（连线是离散行为）
 */
export class AddEdgeCommand extends BaseCommand {
  readonly edgeId: string;

  constructor(edge: FlowEdgeV1) {
    super('Add Edge', [
      {
        type: 'add-edge',
        edge: structuredClone(edge),
      },
    ]);

    this.edgeId = edge.id;
  }
}
