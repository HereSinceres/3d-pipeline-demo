export interface FlowGraphV1 {
  version: 1;

  nodes: Array<{
    id: string;
    type: 'basic' | 'router';

    position: { x: number; y: number; z: number };

    runtime: {
      inCapacity: number;
      outCapacity: number;
      processRatePerSec: number;
      startThreshold: number;

      // 可选：反应器才有
      process?: {
        yield: Record<string, Record<string, number>>;
      };
    };
  }>;

  edges: Array<{
    id: string;
    from: string;
    to: string;

    capacityPerSec: number;
    delaySec: number;
  }>;

  // Router 的逻辑
  routers?: Array<{
    id: string;
    condition: boolean;
  }>;
}
