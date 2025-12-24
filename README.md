# 3D Pipeline Demo v2 (Three.js r182 + Vite + TS)

Includes:
- Nodes with input/output ports (ports are Object3D)
- Pipelines are `PipelineObject extends THREE.Object3D` (add directly to scene)
- Flow direction markers moving along pipe
- Drag nodes / router using TransformControls
- Router node with true/false outputs (toggle route)

## Run
```bash
npm install
npm run dev
```

## Controls
- Orbit: mouse drag
- Drag: click HUD button to attach TransformControls to a node, then drag

## Notes
- This demo rebuilds TubeGeometry every frame for robustness and simplicity.
  For large graphs, optimize by updating only when nodes move, or switch to shader/instancing.
