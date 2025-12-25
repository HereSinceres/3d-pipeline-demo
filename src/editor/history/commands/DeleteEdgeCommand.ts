import type { FlowEdgeV1 } from '../../../runtime/workerProtocol';
import { BaseCommand } from '../Command';

/**
 * Delete edge
 */
export class DeleteEdgeCommand extends BaseCommand {
  readonly edgeId: string;

  constructor(edge: FlowEdgeV1) {
    super('Delete Edge', [
      {
        type: 'delete-edge',
        edge: structuredClone(edge),
      },
    ]);

    this.edgeId = edge.id;
  }
}
