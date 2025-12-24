import { NodeState } from './NodeState';
import { SubstanceType } from '../core/Substance';
import { SubstanceBag, emptyBag, bagSum, addBag, takeFromBag } from './SubstanceBag';
import { applyProcess, ProcessSpec } from './ProcessSpec';

export interface NodeModel {
  id: string;
  inBag: SubstanceBag;
  outBag: SubstanceBag;

  inCapacity: number;
  outCapacity: number;

  processRatePerSec: number;
  startThreshold: number;

  process?: ProcessSpec;

  state: NodeState;
}

export interface EdgeModel {
  id: string;
  from: string;
  to: string;

  capacityPerSec: number;
  delaySec: number;

  inFlight: { bag: SubstanceBag; eta: number }[];

  // 分流比例（Splitter）
  ratio?: number; // 0..1
}

export class Simulation {
  nodes = new Map<string, NodeModel>();
  edges: EdgeModel[] = [];

  tick(dt: number) {
    this.deliver(dt);
    this.process(dt);
    this.send(dt);
    this.updateState();
  }

  private deliver(dt: number) {
    for (const e of this.edges) {
      for (const p of e.inFlight) p.eta -= dt;

      const arrived = e.inFlight.filter(p => p.eta <= 0);
      e.inFlight = e.inFlight.filter(p => p.eta > 0);

      const to = this.nodes.get(e.to)!;
      for (const p of arrived) {
        addBag(to.inBag, p.bag);
      }
    }
  }

  private process(dt: number) {
    for (const n of this.nodes.values()) {
      if (bagSum(n.inBag) < n.startThreshold) {
        n.state = NodeState.IDLE;
        continue;
      }

      if (bagSum(n.outBag) >= n.outCapacity) {
        n.state = NodeState.BLOCKED;
        continue;
      }

      n.state = NodeState.RUNNING;

      const max = n.processRatePerSec * dt;
      const taken = takeFromBag(n.inBag, max);

      if (n.process) {
        const produced = applyProcess(taken, n.process);
        addBag(n.outBag, produced);
      } else {
        addBag(n.outBag, taken);
      }
    }
  }

  private send(dt: number) {
    for (const e of this.edges) {
      const from = this.nodes.get(e.from)!;
      const to = this.nodes.get(e.to)!;

      if (bagSum(from.outBag) <= 0) continue;

      const max = e.capacityPerSec * dt;
      const sendBag = takeFromBag(from.outBag, max);

      if (bagSum(sendBag) <= 0) continue;

      e.inFlight.push({
        bag: sendBag,
        eta: e.delaySec,
      });
    }
  }

  private updateState() {
    for (const n of this.nodes.values()) {
      if (bagSum(n.inBag) >= n.inCapacity * 0.95) {
        n.state = NodeState.BLOCKED;
      }
    }
  }

  feed(nodeId: string, bag: SubstanceBag) {
    const n = this.nodes.get(nodeId)!;
    addBag(n.inBag, bag);
  }
}
