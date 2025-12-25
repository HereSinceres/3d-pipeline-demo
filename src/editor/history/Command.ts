import type { FlowGraphV1 } from "../../runtime/workerProtocol";
import type { Patch } from "./Patch";
import { applyPatch, revertPatch } from "./Patch";

/**
 * Command 接口
 * - Command 本身不持有 graph
 * - 只描述「如何修改 graph」
 */
export interface Command {
  /** 人类可读名称（debug / history panel 用） */
  name: string;

  /** 本 command 产生的 patch 列表 */
  patches: Patch[];

  /**
   * 将 patch 应用到 graph
   * ⚠️ 假设 graph 是一个可变对象（clone 之后）
   */
  apply(graph: FlowGraphV1): void;

  /**
   * 将 patch 回滚
   */
  revert(graph: FlowGraphV1): void;

  /**
   * 是否可以与下一个 command 合并
   * - 只允许修改 this.patches
   * - ❌ 绝不能 touch graph
   *
   * 返回 true 表示：next 已被吸收，不再入栈
   */
  merge?(next: Command): boolean;
}

/**
 * BaseCommand
 * - 绝大多数 Command 都可以直接继承
 * - apply / revert 都是 patch 驱动
 */
export abstract class BaseCommand implements Command {
  name: string;
  patches: Patch[];

  constructor(name: string, patches: Patch[]) {
    this.name = name;
    this.patches = patches;
  }

  /**
   * apply = 顺序 apply patch
   */
  apply(graph: FlowGraphV1) {
    for (const p of this.patches) {
      applyPatch(graph, p);
    }
  }

  /**
   * revert = 逆序 revert patch
   */
  revert(graph: FlowGraphV1) {
    for (let i = this.patches.length - 1; i >= 0; i--) {
      revertPatch(graph, this.patches[i]);
    }
  }

  /**
   * 默认不支持 merge
   * 子类（Move / Update）可 override
   */
  merge(_next: Command): boolean {
    return false;
  }
}
