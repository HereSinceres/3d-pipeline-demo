import React from 'react';

export function StatusBar(props: {
  fps: number;
  nodes: number;
  edges: number;
}) {
  return (
    <div className="statusbar">
      <span>FPS: {props.fps.toFixed(0)}</span>
      <span>Nodes: {props.nodes}</span>
      <span>Edges: {props.edges}</span>
    </div>
  );
}
