import { NodeState } from './NodeState';
import { SubstanceBag } from './SubstanceBag';

export type FlowGraphV1 = {
  version: 1;
  nodes: Array<{
    id: string;
    type: 'basic' | 'router';
    position: { x: number; y: number; z: number };
    runtime?: {
      inCapacity: number;
      outCapacity: number;
      processRatePerSec: number;
      startThreshold: number;
      process?: { yield: Record<string, Record<string, number>> };
    };
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    capacityPerSec: number;
    delaySec: number;
  }>;
  routers?: Array<{ id: string; condition: boolean }>;
};

export type SimInitMsg = { type: 'SIM_INIT'; graph: FlowGraphV1 };
export type SimSetRouterMsg = { type: 'SIM_SET_ROUTER'; id: string; condition: boolean };
export type SimFeedMsg = { type: 'SIM_FEED'; nodeId: string; bag: SubstanceBag };
export type SimSetRunningMsg = { type: 'SIM_SET_RUNNING'; running: boolean };
export type SimSetRateMsg = {
  type: 'SIM_SET_RATE';
  tickHz?: number;
  publishHz?: number;
  // 大图可调：每次 publish 是否发送 ids（默认只在 init 后发送一次）
  publishIds?: boolean;
};

export type SimMsg =
  | SimInitMsg
  | SimSetRouterMsg
  | SimFeedMsg
  | SimSetRunningMsg
  | SimSetRateMsg;

export type SimReady = {
  type: 'SIM_READY';
  nodeIds: string[];
  edgeIds: string[];
};

export type SimError = { type: 'SIM_ERROR'; message: string };

/**
 * 二进制快照（大图优化）：
 * - states: Int8Array (NodeState enum index)
 * - inTotal/outTotal/liquidIn/gasOut: Float32Array
 * - edgeActive: Int8Array (0/1)
 * - edgeInFlight: Float32Array
 */
export type SimSnapshotBin = {
  type: 'SIM_SNAPSHOT_BIN';
  time: number;

  // 可选：仅在 publishIds=true 时发送
  nodeIds?: string[];
  edgeIds?: string[];

  nodeStates: ArrayBuffer;     // Int8Array
  nodeInTotal: ArrayBuffer;    // Float32Array
  nodeOutTotal: ArrayBuffer;   // Float32Array
  nodeLiquidIn: ArrayBuffer;   // Float32Array
  nodeGasOut: ArrayBuffer;     // Float32Array

  edgeActive: ArrayBuffer;     // Int8Array
  edgeInFlight: ArrayBuffer;   // Float32Array
};

export type SimOutMsg = SimReady | SimError | SimSnapshotBin;

// 主线程侧：把 NodeState 映射成 Int8
export const NodeStateToCode: Record<NodeState, number> = {
  [NodeState.IDLE]: 0,
  [NodeState.RUNNING]: 1,
  [NodeState.BLOCKED]: 2,
};

export const CodeToNodeState: Record<number, NodeState> = {
  0: NodeState.IDLE,
  1: NodeState.RUNNING,
  2: NodeState.BLOCKED,
};
