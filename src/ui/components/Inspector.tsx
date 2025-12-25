import React from 'react';
import type { FlowGraphV1, FlowEdgeV1, FlowMonitoringV1, FlowNodeV1 } from '../../runtime/workerProtocol';
import type { Selection } from '../hooks/useSelection';

type Props = {
  graph: FlowGraphV1;
  monitoring: FlowMonitoringV1;
  selection: Selection;

  onUpdateNode: (id: string, patch: any) => void;
  onUpdateEdge?: (id: string, patch: Partial<FlowEdgeV1>) => void;
};

export function Inspector(props: Props) {
  const { graph, selection } = props;

  if (selection.kind === 'none') {
    return <div className="inspector">No selection</div>;
  }

  /* ============================
   * Node Inspector
   * ========================== */

  if (selection.kind === 'node') {
    const node = graph.nodes.find((n) => n.id === selection.id);
    if (!node) return null;

    return (
      <div className="inspector">
        <h3>Node</h3>

        <label>
          Label
          <input
            value={node.label ?? ''}
            onChange={(e) =>
              props.onUpdateNode(node.id, { label: e.target.value })
            }
          />
        </label>

        <NodeAnimationBindings node={node} onUpdate={props.onUpdateNode} />

        {node.monitorPoints?.length ? (
          <div>
            <h4>Monitors</h4>
            {node.monitorPoints.map((p) => {
              const v = props.monitoring.points[p.id];
              if (!v) return null;
              const metric = p.metric ?? 'temperature';
              const value =
                metric === 'temperature'
                  ? v.temperature
                  : metric === 'humidity'
                  ? v.humidity
                  : metric === 'flowRate'
                  ? v.flowRate
                  : metric === 'substance'
                  ? v.substance
                  : undefined;
              if (value == null) return null;
              return (
                <div key={p.id}>
                  <strong>{p.label ?? p.id}</strong>{' '}
                  {metric === 'temperature' ? `T ${Number(value).toFixed(1)}°C` : ''}
                  {metric === 'humidity' ? `H ${Number(value).toFixed(0)}%` : ''}
                  {metric === 'flowRate' ? `Flow ${Number(value).toFixed(1)}` : ''}
                  {metric === 'substance' ? `Mat ${String(value)}` : ''}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  /* ============================
   * Edge Inspector
   * ========================== */

  if (selection.kind === 'edge') {
    const edge = graph.edges.find((e) => e.id === selection.id);
    if (!edge) return null;

    return (
      <EdgeInspector
        edge={edge}
        monitoring={props.monitoring}
        onUpdate={props.onUpdateEdge}
      />
    );
  }

  return null;
}

function NodeAnimationBindings({
  node,
  onUpdate,
}: {
  node: FlowNodeV1;
  onUpdate?: (id: string, patch: Partial<FlowNodeV1>) => void;
}) {
  if (!onUpdate) return null;
  type Binding = NonNullable<FlowNodeV1["animationBindings"]>[number];
  const bindings = node.animationBindings ?? [];

  const parseValue = (raw: string) => {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const num = Number(raw);
    if (!Number.isNaN(num) && raw.trim() !== '') return num;
    return raw;
  };

  const updateBinding = (idx: number, patch: Partial<Binding>) => {
    const next = bindings.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    onUpdate(node.id, { animationBindings: next });
  };

  const removeBinding = (idx: number) => {
    const next = bindings.filter((_, i) => i !== idx);
    onUpdate(node.id, { animationBindings: next });
  };

  const addBinding = () => {
    const next = [
      ...bindings,
      { clip: 'Idle', field: 'state', op: 'eq', value: 'idle' } as Binding,
    ];
    onUpdate(node.id, { animationBindings: next });
  };

  return (
    <div>
      <h4>Animations</h4>
      {bindings.map((b, i) => (
        <div key={`${b.clip}-${i}`}>
          <input
            value={b.clip}
            placeholder="Clip"
            onChange={(e) => updateBinding(i, { clip: e.target.value })}
          />
          <input
            value={b.field}
            placeholder="Field"
            onChange={(e) => updateBinding(i, { field: e.target.value })}
          />
          <select
            value={b.op}
            onChange={(e) => updateBinding(i, { op: e.target.value as any })}
          >
            <option value="eq">=</option>
            <option value="gt">&gt;</option>
            <option value="lt">&lt;</option>
          </select>
          <input
            value={String(b.value)}
            placeholder="Value"
            onChange={(e) => updateBinding(i, { value: parseValue(e.target.value) })}
          />
          <button onClick={() => removeBinding(i)}>🗑</button>
        </div>
      ))}
      <button onClick={addBinding}>＋ Add Binding</button>
    </div>
  );
}

/* ============================
 * Edge Inspector Panel
 * ========================== */

function EdgeInspector({
  edge,
  monitoring,
  onUpdate,
}: {
  edge: FlowEdgeV1;
  monitoring: FlowMonitoringV1;
  onUpdate?: (id: string, patch: Partial<FlowEdgeV1>) => void;
}) {
  if (!onUpdate) return null;

  return (
    <div className="inspector">
      <h3>Edge</h3>

      <div>
        <strong>
          {edge.from} → {edge.to}
        </strong>
      </div>

      <label>
        Capacity / sec
        <input
          type="number"
          value={edge.capacityPerSec}
          onChange={(e) =>
            onUpdate(edge.id, {
              capacityPerSec: Number(e.target.value),
            })
          }
        />
      </label>

      <label>
        Delay (sec)
        <input
          type="number"
          step="0.1"
          value={edge.delaySec}
          onChange={(e) =>
            onUpdate(edge.id, {
              delaySec: Number(e.target.value),
            })
          }
        />
      </label>

      {edge.monitorPoints?.length ? (
        <div>
          <h4>Monitors</h4>
          {edge.monitorPoints.map((p) => {
            const v = monitoring.points[p.id];
            if (!v) return null;
            const metric = p.metric ?? 'flowRate';
            const value =
              metric === 'temperature'
                ? v.temperature
                : metric === 'humidity'
                ? v.humidity
                : metric === 'flowRate'
                ? v.flowRate
                : metric === 'substance'
                ? v.substance
                : undefined;
            if (value == null) return null;
            return (
              <div key={p.id}>
                <strong>{p.label ?? p.id}</strong>{' '}
                {metric === 'temperature' ? `T ${Number(value).toFixed(1)}°C` : ''}
                {metric === 'humidity' ? `H ${Number(value).toFixed(0)}%` : ''}
                {metric === 'flowRate' ? `Flow ${Number(value).toFixed(1)}` : ''}
                {metric === 'substance' ? `Mat ${String(value)}` : ''}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
