import type { FlowGraphV1 } from "../runtime/workerProtocol";
import { createDefaultGraph } from "./defaults";

type Listener = () => void;

export class GraphStore {
  private graph: FlowGraphV1 = createDefaultGraph();
  private listeners = new Set<Listener>();

  get(): FlowGraphV1 {
    return this.graph;
  }

  // 用于 worker / 保存
  getClone(): FlowGraphV1 {
    return structuredClone(this.graph);
  }

  set(next: FlowGraphV1) {
    // ✅ 确保新引用
    this.graph = structuredClone(next);
    this.emit();
  }

  update(mutator: (g: FlowGraphV1) => void) {
    // ✅ immutable update：每次生成新 graph 引用
    const next = structuredClone(this.graph);
    mutator(next);
    this.graph = next;
    this.emit();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}
