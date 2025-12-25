import type { Command } from "./Command";
import type { FlowGraphV1 } from "../../runtime/workerProtocol";

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  constructor(
    private getGraph: () => FlowGraphV1,
    private setGraph: (g: FlowGraphV1) => void
  ) {}

  /**
   * 工业级 execute 语义：
   * - graph 在进入 execute 时，已经是“最新状态”
   * - merge 只决定“是否新入栈”
   * - 绝对不能在 merge 分支中 apply/revert 任何 command
   */
  execute(cmd: Command) {
    const last = this.undoStack[this.undoStack.length - 1];

    // ① 先尝试 merge（不碰 graph）
    if (last && last.merge && last.merge(cmd)) {
      // graph 已经是最新状态
      this.redoStack = [];
      return;
    }

    // ② 非 merge：apply patch 到 graph
    // 注意：这里 apply 的是“补丁语义”，不是回放 UI 行为
    const g = structuredClone(this.getGraph());
    cmd.apply(g);
    this.setGraph(g);

    // ③ 入栈
    this.undoStack.push(cmd);
    this.redoStack = [];
  }

  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return;

    const g = structuredClone(this.getGraph());
    cmd.revert(g);
    this.setGraph(g);

    this.redoStack.push(cmd);
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return;

    const g = structuredClone(this.getGraph());
    cmd.apply(g);
    this.setGraph(g);

    this.undoStack.push(cmd);
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
