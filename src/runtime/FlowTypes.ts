import { SubstanceType } from '../core/Substance';

export type NodeId = string;

export interface FlowPacket {
  amount: number;            // “物质量”（任意单位）
  substance: SubstanceType;
  // 到达目标的剩余时间（秒）
  eta: number;
}

export interface EdgeSpec {
  id: string;
  fromNodeId: NodeId;
  toNodeId: NodeId;

  substance: SubstanceType;

  capacityPerSec: number; // 每秒最大输送量
  delaySec: number;       // 固定延迟（秒）

  // 运行时队列：在管道里飞行的包
  inFlight: FlowPacket[];
}
