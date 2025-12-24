import { NodeState } from './NodeState';

export class NodeRuntime {
  state: NodeState = NodeState.IDLE;

  start() {
    if (this.state === NodeState.IDLE) {
      this.state = NodeState.RUNNING;
    }
  }

  block() {
    this.state = NodeState.BLOCKED;
  }

  unblock() {
    if (this.state === NodeState.BLOCKED) {
      this.state = NodeState.RUNNING;
    }
  }

  done() {
    if (this.state === NodeState.RUNNING) {
      this.state = NodeState.IDLE;
    }
  }

  reset() {
    this.state = NodeState.IDLE;
  }
}
