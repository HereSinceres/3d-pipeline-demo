import type { SubstanceType } from '../core/Substance';

/* ============================================
 * Worker protocol & shared types
 * ========================================= */

export type Vec3 = { x: number; y: number; z: number };

export type NodeType = 'basic' | 'router';

export type MonitorMetricV1 = 'temperature' | 'humidity' | 'flowRate' | 'substance';

export type MonitorThresholdV1 = {
  low?: number;
  high?: number;
  flash?: boolean;
};

export type NodeMonitorPointV1 = {
  id: string;
  label?: string;
  offset?: Vec3;
  metric?: MonitorMetricV1;
  thresholds?: MonitorThresholdV1;
};

export type EdgeMonitorPointV1 = {
  id: string;
  label?: string;
  t: number;
  metric?: MonitorMetricV1;
  thresholds?: MonitorThresholdV1;
};

export type PortSpecV1 = {
  id: string;
  direction: 'in' | 'out';
  position: Vec3;
  label?: string;
};

export type FlowNodeV1 = {
  id: string;
  /** ✅ 可编辑展示名：不参与拓扑与 worker key，id 才是唯一主键 */
  label?: string;
  type: NodeType;
  position: Vec3;
  modelUrl?: string;
  groupId?: string;
  inputs?: PortSpecV1[];
  outputs?: PortSpecV1[];
  animationBindings?: Array<{
    clip: string;
    field: string;
    op: 'eq' | 'gt' | 'lt';
    value: number | string | boolean;
  }>;
  // 可选：监控点（局部坐标）
  monitorPoints?: NodeMonitorPointV1[];
};

export type FlowEdgeV1 = {
  id: string;
  from: string;
  fromPortId?: string;
  to: string;
  toPortId?: string;
  // 可选：折线路径（世界坐标），不包含 from/to 端点
  points?: Vec3[];
  // 可选：监控点（沿管线的比例位置）
  monitorPoints?: EdgeMonitorPointV1[];
  capacityPerSec: number;
  delaySec: number;
};

export type MonitorValueV1 = {
  temperature?: number; // °C
  humidity?: number; // %
  flowRate?: number; // arbitrary unit
  substance?: SubstanceType;
  color?: number; // 0xRRGGBB
  running?: boolean;
};

export type FlowMonitoringV1 = {
  points: Record<string, MonitorValueV1>;
  nodes?: Record<string, { running?: boolean; data?: Record<string, number | string | boolean> }>;
};

export type FlowGraphV1 = {
  version: 1;
  nodes: FlowNodeV1[];
  edges: FlowEdgeV1[];
  groups?: Array<{ id: string; name: string; parentId?: string }>;
};
