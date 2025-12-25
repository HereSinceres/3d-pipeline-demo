import type { FlowGraphV1 } from '../runtime/workerProtocol';

export function createDefaultGraph(): FlowGraphV1 {
  return {
    version: 1,
    nodes: [
      {
        id: 'A',
        label: 'Feed A',
        type: 'basic',
        position: { x: -8, y: 0.6, z: 0 },
        modelUrl: '/models/pump-animated.glb',
        groupId: 'grp-feed',
        animationBindings: [
          { clip: 'Idle', field: 'state', op: 'eq', value: 'idle' },
          { clip: 'Running', field: 'state', op: 'eq', value: 'running' },
          { clip: 'Alarm', field: 'alarm', op: 'eq', value: true },
        ],
        inputs: [
          { id: 'in-1', direction: 'in', position: { x: -1.3, y: 0.0, z: -0.6 } },
          { id: 'in-2', direction: 'in', position: { x: -1.3, y: 0.0, z: 0.6 } },
        ],
        outputs: [
          { id: 'out-1', direction: 'out', position: { x: 1.3, y: 0.0, z: 0.0 } },
        ],
        monitorPoints: [
          {
            id: 'MP-A-T',
            label: 'Temp',
            offset: { x: 0, y: 1.1, z: 0.9 },
            metric: 'temperature',
            thresholds: { high: 55, flash: true },
          },
          {
            id: 'MP-A-H',
            label: 'Humidity',
            offset: { x: 0, y: 1.1, z: -0.9 },
            metric: 'humidity',
            thresholds: { high: 80 },
          },
        ],
      },
      {
        id: 'R',
        label: 'Router',
        type: 'router',
        position: { x: 0, y: 1.1, z: 0 },
        groupId: 'grp-process',
        inputs: [{ id: 'in', direction: 'in', position: { x: 0.0, y: 0.0, z: -1.2 } }],
        outputs: [
          { id: 'out-true', direction: 'out', position: { x: 1.2, y: 0.0, z: 0.0 } },
          { id: 'out-false', direction: 'out', position: { x: -1.2, y: 0.0, z: 0.0 } },
        ],
        monitorPoints: [
          {
            id: 'MP-R-T',
            label: 'Temp',
            offset: { x: 0, y: 1.0, z: 1.1 },
            metric: 'temperature',
            thresholds: { high: 60, flash: true },
          },
        ],
      },
      {
        id: 'B',
        label: 'Compressor B',
        type: 'basic',
        position: { x: 8, y: 0.6, z: 0 },
        modelUrl: '/models/compressor.glb',
        groupId: 'grp-process',
        animationBindings: [
          { clip: 'Idle', field: 'state', op: 'eq', value: 'idle' },
          { clip: 'Running', field: 'state', op: 'eq', value: 'running' },
          { clip: 'Alarm', field: 'alarm', op: 'eq', value: true },
        ],
        inputs: [{ id: 'in', direction: 'in', position: { x: -1.3, y: 0.0, z: 0.0 } }],
        outputs: [
          { id: 'out-1', direction: 'out', position: { x: 1.3, y: 0.0, z: -0.5 } },
          { id: 'out-2', direction: 'out', position: { x: 1.3, y: 0.0, z: 0.5 } },
        ],
        monitorPoints: [
          {
            id: 'MP-B-T',
            label: 'Temp',
            offset: { x: 0, y: 1.1, z: 0.9 },
            metric: 'temperature',
            thresholds: { high: 70, flash: true },
          },
          {
            id: 'MP-B-H',
            label: 'Humidity',
            offset: { x: 0, y: 1.1, z: -0.9 },
            metric: 'humidity',
            thresholds: { high: 85 },
          },
        ],
      },
      {
        id: 'C',
        label: 'Tank C',
        type: 'basic',
        position: { x: 8, y: 0.6, z: -8 },
        groupId: 'grp-storage',
        inputs: [{ id: 'in', direction: 'in', position: { x: -1.3, y: 0.0, z: 0.0 } }],
        outputs: [{ id: 'out', direction: 'out', position: { x: 1.3, y: 0.0, z: 0.0 } }],
        monitorPoints: [
          {
            id: 'MP-C-T',
            label: 'Temp',
            offset: { x: 0, y: 1.1, z: 0 },
            metric: 'temperature',
            thresholds: { high: 50 },
          },
        ],
      },
    ],
    edges: [
      {
        id: 'AR',
        from: 'A',
        fromPortId: 'out-1',
        to: 'R',
        toPortId: 'in',
        // 折线路径示例（中间点，不含 from/to 端点）
        points: [
          { x: -4, y: 0.6, z: 2.5 },
          { x: -1.5, y: 0.6, z: 2.5 },
        ],
        monitorPoints: [
          { id: 'MP-AR-F', label: 'Flow', t: 0.35, metric: 'flowRate', thresholds: { high: 14, flash: true } },
          { id: 'MP-AR-S', label: 'Substance', t: 0.7, metric: 'substance' },
        ],
        capacityPerSec: 18,
        delaySec: 0.35,
      },
      { id: 'RB', from: 'R', fromPortId: 'out-true', to: 'B', toPortId: 'in', capacityPerSec: 12, delaySec: 0.6 },
      {
        id: 'RC',
        from: 'R',
        fromPortId: 'out-false',
        to: 'C',
        toPortId: 'in',
        points: [{ x: 4, y: 0.6, z: -4 }],
        monitorPoints: [{ id: 'MP-RC-F', label: 'Flow', t: 0.55, metric: 'flowRate', thresholds: { high: 12 } }],
        capacityPerSec: 10,
        delaySec: 0.6,
      },
    ],
    groups: [
      { id: 'grp-feed', name: 'Feed Section' },
      { id: 'grp-process', name: 'Process', parentId: 'grp-feed' },
      { id: 'grp-storage', name: 'Storage' },
    ],
  };
}
