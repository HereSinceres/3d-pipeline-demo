import { FlowGraphV1 } from './types';
import { SubstanceType } from '../core/Substance';
import { emptyBag } from '../runtime/SubstanceBag';
import { NodeState } from '../runtime/NodeState';
import { Simulation } from '../runtime/Simulation';

import { BasicNode } from '../nodes/BasicNode';
import { RouterNode } from '../nodes/RouterNode';
import { PipelineObject } from '../objects/PipelineObject';

import * as THREE from 'three';

export function serializeFlow(params: {
  nodes: Array<BasicNode | RouterNode>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    capacityPerSec: number;
    delaySec: number;
  }>;
  sim: Simulation;
}): FlowGraphV1 {
  const { nodes, edges, sim } = params;

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
      };

      if (n instanceof RouterNode) {
        return {
          ...base,
          type: 'router',
          runtime: {
            inCapacity: 0,
            outCapacity: 0,
            processRatePerSec: 0,
            startThreshold: 0,
          },
        };
      }

      const model = sim.nodes.get(n.userData.id)!;

      return {
        ...base,
        type: 'basic',
        runtime: {
          inCapacity: model.inCapacity,
          outCapacity: model.outCapacity,
          processRatePerSec: model.processRatePerSec,
          startThreshold: model.startThreshold,
          process: model.process,
        },
      };
    }),

    edges: edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      capacityPerSec: e.capacityPerSec,
      delaySec: e.delaySec,
    })),

    routers: nodes
      .filter((n) => n instanceof RouterNode)
      .map((r) => ({
        id: r.userData.id as string,
        condition: (r as RouterNode).condition,
      })),
  };
}
