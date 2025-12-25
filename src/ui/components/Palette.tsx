import React from 'react';
import type { FlowGraphV1 } from '../../runtime/workerProtocol';

type Props = {
  graph: FlowGraphV1;
  selectedNodeId?: string;

  onSelectNode: (id: string) => void;
  onAddBasic: () => void;
  onAddRouter: () => void;

  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
};

export function Palette(props: Props) {
  const { graph } = props;
  const groups = graph.groups ?? [];
  const groupChildren = new Map<string | undefined, typeof groups>();
  const groupIds = new Set(groups.map((g) => g.id));
  const groupNodes = new Map<string, typeof graph.nodes>();

  for (const g of groups) {
    const key = g.parentId;
    if (!groupChildren.has(key)) groupChildren.set(key, []);
    groupChildren.get(key)!.push(g);
  }

  for (const n of graph.nodes) {
    if (!n.groupId) continue;
    if (!groupNodes.has(n.groupId)) groupNodes.set(n.groupId, []);
    groupNodes.get(n.groupId)!.push(n);
  }

  const renderNodeItem = (n: typeof graph.nodes[number]) => (
    <li key={n.id}>
      <span onClick={() => props.onSelectNode(n.id)}>
        {n.label ?? n.id}
      </span>
      <button onClick={() => props.onDeleteNode(n.id)}>🗑</button>
    </li>
  );

  const renderGroup = (g: typeof groups[number]) => {
    const children = groupChildren.get(g.id) ?? [];
    const nodes = groupNodes.get(g.id) ?? [];
    return (
      <li key={g.id}>
        <strong>{g.name}</strong>
        {(children.length > 0 || nodes.length > 0) && (
          <ul>
            {nodes.map(renderNodeItem)}
            {children.map(renderGroup)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="palette">
      <h3>Nodes</h3>

      <button onClick={props.onAddBasic}>＋ Basic</button>
      <button onClick={props.onAddRouter}>＋ Router</button>

      <ul>
        {groupChildren.get(undefined)?.map(renderGroup)}
        {graph.nodes
          .filter((n) => !n.groupId || !groupIds.has(n.groupId))
          .map(renderNodeItem)}
      </ul>

      <h3>Edges</h3>

      <ul>
        {graph.edges.map((e) => (
          <li key={e.id}>
            <span>
              {e.from} → {e.to}
            </span>
            <button onClick={() => props.onDeleteEdge(e.id)}>🗑</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
