import { FlowGraphV1 } from './types';
import { emptyBag } from '../runtime/SubstanceBag';
import { NodeState } from '../runtime/NodeState';
import { Simulation } from '../runtime/Simulation';
import { SubstanceType } from '../core/Substance';

import { BasicNode } from '../nodes/BasicNode';
import { RouterNode } from '../nodes/RouterNode';
import { PipelineObject } from '../objects/PipelineObject';
import * as THREE from 'three';

export function loadFlowGraph(params: {
  graph: FlowGraphV1;
  scene: THREE.Scene;
  substance: SubstanceType;
}) {
  const { graph, scene, substance } = params;

  const sim = new Simulation();

  const nodeMap = new Map<string, BasicNode | RouterNode>();

  // 1️⃣ Nodes
  for (const n of graph.nodes) {
    let node: BasicNode | RouterNode;

    if (n.type === 'router') {
      node = new RouterNode();
    } else {
      node = new BasicNode(n.id);
    }

    node.position.set(n.position.x, n.position.y, n.position.z);
    node.userData.id = n.id;

    scene.add(node);
    nodeMap.set(n.id, node);

    if (n.type === 'basic') {
      sim.nodes.set(n.id, {
        id: n.id,
        inBag: emptyBag(),
        outBag: emptyBag(),
        inCapacity: n.runtime.inCapacity,
        outCapacity: n.runtime.outCapacity,
        processRatePerSec: n.runtime.processRatePerSec,
        startThreshold: n.runtime.startThreshold,
        state: NodeState.IDLE,
        process: n.runtime.process,
      });
    }
  }

  // 2️⃣ Routers
  graph.routers?.forEach((r) => {
    const router = nodeMap.get(r.id) as RouterNode;
    router.condition = r.condition;
  });

  // 3️⃣ Edges + Pipes
  const pipes: PipelineObject[] = [];

  for (const e of graph.edges) {
    const fromNode = nodeMap.get(e.from)!;
    const toNode = nodeMap.get(e.to)!;

    const fromPort =
      fromNode instanceof RouterNode ? fromNode.route() : fromNode.output;
    const toPort =
      toNode instanceof RouterNode ? toNode.input : toNode.input;

    const pipe = new PipelineObject(fromPort, toPort, substance);
    scene.add(pipe);
    pipes.push(pipe);

    sim.edges.push({
      id: e.id,
      from: e.from,
      to: e.to,
      capacityPerSec: e.capacityPerSec,
      delaySec: e.delaySec,
      inFlight: [],
    });
  }

  return { sim, nodeMap, pipes };
}
