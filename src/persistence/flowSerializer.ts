import { FlowGraphV1 } from './types';
import { BasicNode } from '../nodes/BasicNode';
import { RouterNode } from '../nodes/RouterNode';

export function serializeFlow(params: {
  nodes: Array<BasicNode | RouterNode>;
  edges: Array<{
    id: string;
    from: string;
    fromPortId?: string;
    to: string;
    toPortId?: string;
    points?: Array<{ x: number; y: number; z: number }>;
    monitorPoints?: Array<{ id: string; label?: string; t: number; metric?: string; thresholds?: { low?: number; high?: number; flash?: boolean } }>;
    capacityPerSec: number;
    delaySec: number;
  }>;
}): FlowGraphV1 {
  const { nodes, edges } = params;

  return {
    version: 1,

    nodes: nodes.map((n) => {
      const base = {
        id: n.userData.id as string,
        position: {
          x: n.position.x,
          y: n.position.y,
          z: n.position.z,
        },
        monitorPoints: (n as any).monitorPoints,
        modelUrl: (n as any).modelUrl,
        inputs: (n as any).inputs,
        outputs: (n as any).outputs,
        animationBindings: (n as any).animationBindings,
      };

      if (n instanceof RouterNode) {
        return {
          ...base,
          type: 'router',
        };
      }

      return {
        ...base,
        type: 'basic',
      };
    }),

    edges: edges.map((e) => ({
      id: e.id,
      from: e.from,
      fromPortId: e.fromPortId,
      to: e.to,
      toPortId: e.toPortId,
      points: e.points,
      monitorPoints: e.monitorPoints,
      capacityPerSec: e.capacityPerSec,
      delaySec: e.delaySec,
    })),

  };
}
