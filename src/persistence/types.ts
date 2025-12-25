export interface FlowGraphV1 {
  version: 1;

  nodes: Array<{
    id: string;
    type: 'basic' | 'router';

    position: { x: number; y: number; z: number };
    modelUrl?: string;
    groupId?: string;
    inputs?: Array<{ id: string; direction: 'in' | 'out'; position: { x: number; y: number; z: number }; label?: string }>;
    outputs?: Array<{ id: string; direction: 'in' | 'out'; position: { x: number; y: number; z: number }; label?: string }>;
    animationBindings?: Array<{
      clip: string;
      field: string;
      op: 'eq' | 'gt' | 'lt';
      value: number | string | boolean;
    }>;
    // 可选：监控点（局部坐标）
    monitorPoints?: Array<{
      id: string;
      label?: string;
      offset?: { x: number; y: number; z: number };
      metric?: 'temperature' | 'humidity' | 'flowRate' | 'substance';
      thresholds?: { low?: number; high?: number; flash?: boolean };
    }>;

  }>;

  edges: Array<{
    id: string;
    from: string;
    fromPortId?: string;
    to: string;
    toPortId?: string;
    // 可选：折线路径（世界坐标），不包含 from/to 端点
    points?: Array<{ x: number; y: number; z: number }>;
    // 可选：监控点（沿管线比例）
    monitorPoints?: Array<{
      id: string;
      label?: string;
      t: number;
      metric?: 'temperature' | 'humidity' | 'flowRate' | 'substance';
      thresholds?: { low?: number; high?: number; flash?: boolean };
    }>;

    capacityPerSec: number;
    delaySec: number;
  }>;

  groups?: Array<{
    id: string;
    name: string;
    parentId?: string;
  }>;

  // 可选：监控数据（按监控点 id 绑定）
  monitoring?: {
    points: Record<string, { temperature?: number; humidity?: number; flowRate?: number; substance?: string; color?: number; running?: boolean }>;
    nodes?: Record<string, { running?: boolean; data?: Record<string, number | string | boolean> }>;
  };

}
