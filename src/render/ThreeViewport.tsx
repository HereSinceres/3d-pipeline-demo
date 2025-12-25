import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

import type { FlowGraphV1, FlowMonitoringV1, MonitorMetricV1 } from '../runtime/workerProtocol';

import type { GraphStore } from '../graph/GraphStore';
import type { Selection } from '../ui/hooks/useSelection';

import { SubstanceColor, SubstanceType } from '../core/Substance';
import { BasicNode } from '../nodes/BasicNode';
import { RouterNode } from '../nodes/RouterNode';
import { PipelineObject } from '../objects/PipelineObject';

import { EdgeDrawController } from '../editor/interactions/EdgeDrawController';

type Props = {
  store: GraphStore;
  graph: FlowGraphV1;
  monitoring: FlowMonitoringV1;
  selection: Selection;
  onSelect: (sel: Selection) => void;

  exposeCamera?: (camera: THREE.Camera) => void;

  /** ✅ 让 AppShell 用 History 去创建 Edge */
  onCreateEdge: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => void;

  /** ✅ Edge points editing */
  onUpdateEdge: (edgeId: string, patch: Partial<FlowGraphV1["edges"][number]>) => void;

  /** ✅ Node monitor editing */
  onUpdateNode: (nodeId: string, patch: Partial<FlowGraphV1["nodes"][number]>) => void;

  /** ✅ TransformControls drag end → 入栈 Move Node */
  onMoveNode: (id: string, position: { x: number; y: number; z: number }) => void;
};

export function ThreeViewport(props: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  const propsRef = useRef({
    graph: props.graph,
    monitoring: props.monitoring,
    selection: props.selection,
    onSelect: props.onSelect,
    onUpdateEdge: props.onUpdateEdge,
    onUpdateNode: props.onUpdateNode,
    onMoveNode: props.onMoveNode,
  });

  useEffect(() => {
    propsRef.current = {
      graph: props.graph,
      monitoring: props.monitoring,
      selection: props.selection,
      onSelect: props.onSelect,
      onUpdateEdge: props.onUpdateEdge,
      onUpdateNode: props.onUpdateNode,
      onMoveNode: props.onMoveNode,
    };
  }, [props.graph, props.monitoring, props.selection, props.onSelect, props.onUpdateEdge, props.onUpdateNode, props.onMoveNode]);

  type DragStart =
    | { kind: 'node'; id: string; x: number; y: number; z: number }
    | { kind: 'edge-point'; edgeId: string; index: number; x: number; y: number; z: number }
    | { kind: 'monitor-point'; target: 'node' | 'edge'; targetId: string; index: number; x: number; y: number; z: number }
    | { kind: 'port'; nodeId: string; portId: string; direction: 'in' | 'out'; x: number; y: number; z: number };

  const rt = useRef({
    renderer: null as THREE.WebGLRenderer | null,
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    orbit: null as OrbitControls | null,
    transform: null as TransformControls | null,
    edgeDraw: null as EdgeDrawController | null,
    edgeHandles: null as THREE.Group | null,
    monitorGroup: null as THREE.Group | null,
    monitorHandles: null as THREE.Group | null,
    groupBoxes: null as THREE.Group | null,
    groupBoxMap: new Map<string, THREE.Mesh>(),
    contextMenu: null as HTMLDivElement | null,
    contextTarget: null as
      | { kind: 'edge-control-insert'; edgeId: string; insertIndex: number; point: THREE.Vector3 }
      | { kind: 'edge-control-delete'; edgeId: string; index: number }
      | { kind: 'monitor-insert'; target: 'node' | 'edge'; targetId: string; point: THREE.Vector3 }
      | { kind: 'monitor-delete'; target: 'node' | 'edge'; targetId: string; index: number }
      | null,

    nodeObj: new Map<string, BasicNode | RouterNode>(),
    pipeObj: new Map<string, PipelineObject>(),

    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),

    // for move command
    dragStart: null as DragStart | null,
  });

  const getEdgeById = (edgeId: string) =>
    propsRef.current.graph.edges.find((e) => e.id === edgeId);

  const resolvePort = (node: BasicNode | RouterNode, direction: 'in' | 'out', portId?: string) => {
    const getPortById = (node as any).getPortById?.bind(node);
    if (portId && getPortById) {
      const found = getPortById(portId);
      if (found) return found;
    }
    const ports: THREE.Object3D[] = (node as any).getPorts?.() ?? [];
    const match = ports.find((p) => p.userData?.portType === (direction === 'in' ? 'input' : 'output'));
    return match ?? null;
  };

  const resolveEdgePorts = (r: typeof rt.current, edgeId: string) => {
    const edge = getEdgeById(edgeId);
    if (!edge) return null;
    const fromNode = r.nodeObj.get(edge.from);
    const toNode = r.nodeObj.get(edge.to);
    if (!fromNode || !toNode) return null;

    const fromPort = resolvePort(fromNode, 'out', edge.fromPortId);
    const toPort = resolvePort(toNode, 'in', edge.toPortId);

    if (!fromPort || !toPort) return null;
    return { fromPort, toPort };
  };

  const clearEdgeHandles = (group: THREE.Group) => {
    while (group.children.length > 0) {
      const child = group.children.pop()!;
      group.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose?.();
      (mesh.material as THREE.Material | undefined)?.dispose?.();
    }
  };

  const clearMonitorGroup = (group: THREE.Group) => {
    while (group.children.length > 0) {
      const child = group.children.pop()!;
      group.remove(child);
      const sprite = child as THREE.Sprite;
      sprite.material?.dispose?.();
      (sprite.material as THREE.SpriteMaterial | undefined)?.map?.dispose?.();
    }
  };

  const updateGroupBoxes = (r: typeof rt.current) => {
    if (!r.groupBoxes) return;
    const graph = propsRef.current.graph;
    const groups = graph.groups ?? [];
    const nodeByGroup = new Map<string, THREE.Object3D[]>();
    for (const n of graph.nodes) {
      if (!n.groupId) continue;
      const obj = r.nodeObj.get(n.id);
      if (!obj) continue;
      if (!nodeByGroup.has(n.groupId)) nodeByGroup.set(n.groupId, []);
      nodeByGroup.get(n.groupId)!.push(obj);
    }

    const tmpBox = new THREE.Box3();
    const tmpSize = new THREE.Vector3();
    const tmpCenter = new THREE.Vector3();
    for (const g of groups) {
      const mesh = r.groupBoxMap.get(g.id);
      if (!mesh) continue;
      const nodes = nodeByGroup.get(g.id) ?? [];
      if (nodes.length === 0) {
        mesh.visible = false;
        continue;
      }

      tmpBox.makeEmpty();
      for (const obj of nodes) {
        tmpBox.expandByObject(obj);
      }
      tmpBox.getSize(tmpSize);
      tmpBox.getCenter(tmpCenter);

      const pad = 0.8;
      tmpSize.addScalar(pad);
      mesh.visible = true;
      mesh.position.copy(tmpCenter);
      mesh.scale.set(Math.max(tmpSize.x, 0.1), Math.max(tmpSize.y, 0.1), Math.max(tmpSize.z, 0.1));
    }
  };

  const getHandlePoints = (group: THREE.Group) => {
    const handles = group.children
      .map((c) => c as THREE.Mesh)
      .filter((m) => m.userData?.kind === 'edge-point')
      .sort((a, b) => (a.userData.index ?? 0) - (b.userData.index ?? 0));
    return handles.map((h) => h.position.clone());
  };

  const createMonitorSprite = (text: string, color: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(8, 8, canvas.width - 16, canvas.height - 16);

    ctx.font = '22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.6, 1.2, 1);
    return sprite;
  };

  const formatMetric = (metric: MonitorMetricV1, value: number | string) => {
    switch (metric) {
      case 'temperature':
        return `T ${Number(value).toFixed(1)}°C`;
      case 'humidity':
        return `H ${Number(value).toFixed(0)}%`;
      case 'flowRate':
        return `Flow ${Number(value).toFixed(1)}`;
      case 'substance':
        return `Mat ${String(value)}`;
      default:
        return String(value);
    }
  };

  const hideContextMenu = (r: typeof rt.current) => {
    if (!r.contextMenu) return;
    r.contextMenu.style.display = 'none';
    r.contextTarget = null;
  };

  const showContextMenu = (r: typeof rt.current, x: number, y: number) => {
    if (!r.contextMenu) return;
    r.contextMenu.style.display = 'block';
    r.contextMenu.style.left = `${x}px`;
    r.contextMenu.style.top = `${y}px`;
  };

  const computeInsertIndex = (r: typeof rt.current, edgeId: string, hitPoint: THREE.Vector3) => {
    const edge = getEdgeById(edgeId);
    const ports = resolveEdgePorts(r, edgeId);
    if (!edge || !ports) return null;
    const fromPos = ports.fromPort.getWorldPosition(new THREE.Vector3());
    const toPos = ports.toPort.getWorldPosition(new THREE.Vector3());
    const midPoints = edge.points?.map((p) => new THREE.Vector3(p.x, p.y, p.z)) ?? [];
    const path = [fromPos, ...midPoints, toPos];
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const ab = new THREE.Vector3().subVectors(b, a);
      const ap = new THREE.Vector3().subVectors(hitPoint, a);
      const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq()));
      const proj = a.clone().add(ab.multiplyScalar(t));
      const d = proj.distanceToSquared(hitPoint);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return { insertIndex: Math.min(bestIdx, midPoints.length), point: hitPoint.clone() };
  };

  /* ============================
   * Init
   * ========================== */

  useEffect(() => {
    const host = hostRef.current!;
    const r = rt.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);

    const camera = new THREE.PerspectiveCamera(
      60,
      host.clientWidth / host.clientHeight,
      0.1,
      2000
    );
    camera.position.set(12, 10, 16);
    camera.lookAt(0, 0, 0);
    props.exposeCamera?.(camera);

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(10, 18, 10);
    scene.add(dir);

    const grid = new THREE.GridHelper(60, 60, 0x334155, 0x1f2937);
    (grid.material as any).opacity = 0.35;
    (grid.material as any).transparent = true;
    scene.add(grid);

    const edgeHandles = new THREE.Group();
    scene.add(edgeHandles);

    const monitorGroup = new THREE.Group();
    scene.add(monitorGroup);

    const monitorHandles = new THREE.Group();
    scene.add(monitorHandles);

    const groupBoxes = new THREE.Group();
    scene.add(groupBoxes);

    const menu = document.createElement('div');
    menu.style.position = 'absolute';
    menu.style.display = 'none';
    menu.style.minWidth = '160px';
    menu.style.background = 'rgba(15, 23, 42, 0.95)';
    menu.style.border = '1px solid rgba(148, 163, 184, 0.35)';
    menu.style.borderRadius = '8px';
    menu.style.padding = '6px';
    menu.style.color = '#e2e8f0';
    menu.style.font = '13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
    menu.style.boxShadow = '0 6px 18px rgba(0,0,0,0.35)';
    menu.style.zIndex = '20';

    const insertBtn = document.createElement('button');
    insertBtn.textContent = 'Insert control point';
    insertBtn.style.display = 'block';
    insertBtn.style.width = '100%';
    insertBtn.style.textAlign = 'left';
    insertBtn.style.background = 'transparent';
    insertBtn.style.border = 'none';
    insertBtn.style.color = 'inherit';
    insertBtn.style.padding = '6px 8px';
    insertBtn.style.cursor = 'pointer';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete control point';

    const addMonitorBtn = document.createElement('button');
    addMonitorBtn.textContent = 'Add monitor point';
    addMonitorBtn.style.display = 'block';
    addMonitorBtn.style.width = '100%';
    addMonitorBtn.style.textAlign = 'left';
    addMonitorBtn.style.background = 'transparent';
    addMonitorBtn.style.border = 'none';
    addMonitorBtn.style.color = 'inherit';
    addMonitorBtn.style.padding = '6px 8px';
    addMonitorBtn.style.cursor = 'pointer';

    const deleteMonitorBtn = document.createElement('button');
    deleteMonitorBtn.textContent = 'Delete monitor point';
    deleteMonitorBtn.style.display = 'block';
    deleteMonitorBtn.style.width = '100%';
    deleteMonitorBtn.style.textAlign = 'left';
    deleteMonitorBtn.style.background = 'transparent';
    deleteMonitorBtn.style.border = 'none';
    deleteMonitorBtn.style.color = 'inherit';
    deleteMonitorBtn.style.padding = '6px 8px';
    deleteMonitorBtn.style.cursor = 'pointer';
    deleteBtn.style.display = 'block';
    deleteBtn.style.width = '100%';
    deleteBtn.style.textAlign = 'left';
    deleteBtn.style.background = 'transparent';
    deleteBtn.style.border = 'none';
    deleteBtn.style.color = 'inherit';
    deleteBtn.style.padding = '6px 8px';
    deleteBtn.style.cursor = 'pointer';

    insertBtn.addEventListener('click', () => {
      const target = r.contextTarget;
      if (!target || target.kind !== 'edge-control-insert') return;
      const edge = getEdgeById(target.edgeId);
      if (!edge) return;
      const points = edge.points?.slice() ?? [];
      points.splice(target.insertIndex, 0, {
        x: target.point.x,
        y: target.point.y,
        z: target.point.z,
      });
      propsRef.current.onUpdateEdge(target.edgeId, { points });
      hideContextMenu(r);
    });

    deleteBtn.addEventListener('click', () => {
      const target = r.contextTarget;
      if (!target || target.kind !== 'edge-control-delete') return;
      const edge = getEdgeById(target.edgeId);
      if (!edge?.points) return;
      const points = edge.points.slice();
      if (target.index < 0 || target.index >= points.length) return;
      points.splice(target.index, 1);
      propsRef.current.onUpdateEdge(target.edgeId, { points });
      hideContextMenu(r);
    });

    addMonitorBtn.addEventListener('click', () => {
      const target = r.contextTarget;
      if (!target) return;

      if (target.kind === 'monitor-insert' && target.target === 'node') {
        const node = propsRef.current.graph.nodes.find((n) => n.id === target.targetId);
        if (!node) return;
        const nextId = `${node.id}-MP${(node.monitorPoints?.length ?? 0) + 1}`;
        const offset = target.point.clone();
        const mp = {
          id: nextId,
          label: 'Temp',
          offset: { x: offset.x, y: offset.y, z: offset.z },
          metric: 'temperature',
          thresholds: { high: 60, flash: true },
        };
        const next = [...(node.monitorPoints ?? []), mp];
        propsRef.current.onUpdateNode(node.id, { monitorPoints: next });
      } else if (target.kind === 'edge-control-insert') {
        const edge = getEdgeById(target.edgeId);
        if (!edge) return;
        const pipe = rt.current.pipeObj.get(edge.id);
        if (!pipe) return;
        const t = pipe.getTAtPoint(target.point);
        const nextId = `${edge.id}-MP${(edge.monitorPoints?.length ?? 0) + 1}`;
        const mp = {
          id: nextId,
          label: 'Flow',
          t,
          metric: 'flowRate',
          thresholds: { high: 12, flash: true },
        };
        const next = [...(edge.monitorPoints ?? []), mp];
        propsRef.current.onUpdateEdge(edge.id, { monitorPoints: next });
      }

      hideContextMenu(r);
    });

    deleteMonitorBtn.addEventListener('click', () => {
      const target = r.contextTarget;
      if (!target || target.kind !== 'monitor-delete') return;

      if (target.target === 'node') {
        const node = propsRef.current.graph.nodes.find((n) => n.id === target.targetId);
        if (!node?.monitorPoints) return;
        const next = node.monitorPoints.slice();
        if (target.index < 0 || target.index >= next.length) return;
        next.splice(target.index, 1);
        propsRef.current.onUpdateNode(node.id, { monitorPoints: next });
      } else {
        const edge = getEdgeById(target.targetId);
        if (!edge?.monitorPoints) return;
        const next = edge.monitorPoints.slice();
        if (target.index < 0 || target.index >= next.length) return;
        next.splice(target.index, 1);
        propsRef.current.onUpdateEdge(edge.id, { monitorPoints: next });
      }

      hideContextMenu(r);
    });

    menu.appendChild(insertBtn);
    menu.appendChild(deleteBtn);
    menu.appendChild(addMonitorBtn);
    menu.appendChild(deleteMonitorBtn);
    host.style.position = 'relative';
    host.appendChild(menu);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;

    const transform = new TransformControls(camera, renderer.domElement);

    transform.addEventListener('dragging-changed', (e) => {
      orbit.enabled = !e.value;
    });

    // drag start / end → only commit at end (industrial)
    transform.addEventListener('mouseDown', () => {
      const obj = transform.object;
      if (!obj) return;
      const ud = (obj as any).userData;
      if (ud?.kind === 'port') {
        r.dragStart = {
          kind: 'port',
          nodeId: ud.nodeId,
          portId: ud.portId,
          direction: ud.portType === 'input' ? 'in' : 'out',
          x: obj.position.x,
          y: obj.position.y,
          z: obj.position.z,
        };
        return;
      }
      if (ud?.kind === 'edge-point') {
        r.dragStart = {
          kind: 'edge-point',
          edgeId: ud.edgeId,
          index: ud.index,
          x: obj.position.x,
          y: obj.position.y,
          z: obj.position.z,
        };
        return;
      }

      if (ud?.kind === 'monitor-point') {
        r.dragStart = {
          kind: 'monitor-point',
          target: ud.target,
          targetId: ud.targetId,
          index: ud.index,
          x: obj.position.x,
          y: obj.position.y,
          z: obj.position.z,
        };
        return;
      }

      const id = ud?.id;
      if (!id) return;
      r.dragStart = { kind: 'node', id, x: obj.position.x, y: obj.position.y, z: obj.position.z };
    });

    transform.addEventListener('mouseUp', () => {
      const obj = transform.object;
      if (!obj || !r.dragStart) return;

      if (r.dragStart.kind === 'edge-point') {
        const dx = Math.abs(obj.position.x - r.dragStart.x);
        const dy = Math.abs(obj.position.y - r.dragStart.y);
        const dz = Math.abs(obj.position.z - r.dragStart.z);

        if (dx + dy + dz < 1e-6) {
          r.dragStart = null;
          return;
        }

        const group = r.edgeHandles;
        if (group) {
          const points = getHandlePoints(group).map((p) => ({ x: p.x, y: p.y, z: p.z }));
          propsRef.current.onUpdateEdge(r.dragStart.edgeId, { points });
        }

        r.dragStart = null;
        return;
      }

      if (r.dragStart.kind === 'port') {
        const dx = Math.abs(obj.position.x - r.dragStart.x);
        const dy = Math.abs(obj.position.y - r.dragStart.y);
        const dz = Math.abs(obj.position.z - r.dragStart.z);

        if (dx + dy + dz < 1e-6) {
          r.dragStart = null;
          return;
        }

        const node = r.nodeObj.get(r.dragStart.nodeId);
        const g = propsRef.current.graph.nodes.find((n) => n.id === r.dragStart.nodeId);
        if (!node || !g) {
          r.dragStart = null;
          return;
        }

        const local = node.worldToLocal(obj.position.clone());
        const list = r.dragStart.direction === 'in' ? (g.inputs ?? []) : (g.outputs ?? []);
        const next = list.map((p) =>
          p.id === r.dragStart.portId
            ? { ...p, position: { x: local.x, y: local.y, z: local.z } }
            : p
        );

        if (r.dragStart.direction === 'in') {
          propsRef.current.onUpdateNode(g.id, { inputs: next });
        } else {
          propsRef.current.onUpdateNode(g.id, { outputs: next });
        }

        r.dragStart = null;
        return;
      }

      if (r.dragStart.kind === 'monitor-point') {
        const dx = Math.abs(obj.position.x - r.dragStart.x);
        const dy = Math.abs(obj.position.y - r.dragStart.y);
        const dz = Math.abs(obj.position.z - r.dragStart.z);

        if (dx + dy + dz < 1e-6) {
          r.dragStart = null;
          return;
        }

        if (r.dragStart.target === 'node') {
          const node = r.nodeObj.get(r.dragStart.targetId);
          const g = propsRef.current.graph.nodes.find((n) => n.id === r.dragStart.targetId);
          if (!node || !g?.monitorPoints) {
            r.dragStart = null;
            return;
          }
          const local = node.worldToLocal(obj.position.clone());
          const next = g.monitorPoints.slice();
          const mp = next[r.dragStart.index];
          if (!mp) {
            r.dragStart = null;
            return;
          }
          mp.offset = { x: local.x, y: local.y, z: local.z };
          propsRef.current.onUpdateNode(g.id, { monitorPoints: next });
        } else {
          const edge = getEdgeById(r.dragStart.targetId);
          const pipe = edge ? r.pipeObj.get(edge.id) : null;
          if (!edge?.monitorPoints || !pipe) {
            r.dragStart = null;
            return;
          }
          const t = pipe.getTAtPoint(obj.position.clone());
          const next = edge.monitorPoints.slice();
          const mp = next[r.dragStart.index];
          if (!mp) {
            r.dragStart = null;
            return;
          }
          mp.t = t;
          propsRef.current.onUpdateEdge(edge.id, { monitorPoints: next });
        }

        r.dragStart = null;
        return;
      }

      const id = (obj as any).userData?.id;
      if (!id) return;

      const dx = Math.abs(obj.position.x - r.dragStart.x);
      const dy = Math.abs(obj.position.y - r.dragStart.y);
      const dz = Math.abs(obj.position.z - r.dragStart.z);

      // 忽略微小抖动
      if (dx + dy + dz < 1e-6) {
        r.dragStart = null;
        return;
      }

      propsRef.current.onMoveNode(id, { x: obj.position.x, y: obj.position.y, z: obj.position.z });
      r.dragStart = null;
    });

    transform.addEventListener('objectChange', () => {
      const obj = transform.object;
      if (!obj) return;
      const ud = (obj as any).userData;
      if (ud?.kind !== 'edge-point') return;
      const group = r.edgeHandles;
      if (!group) return;
      const points = getHandlePoints(group);
      const pipe = r.pipeObj.get(ud.edgeId);
      if (pipe) pipe.setWaypoints(points);
    });

    scene.add(transform.getHelper());

    /* ---------- EdgeDraw ---------- */

    const edgeDraw = new EdgeDrawController(
      scene,
      camera,
      renderer.domElement,
      () => {
        const ports: THREE.Object3D[] = [];
        for (const n of r.nodeObj.values()) {
          const list: THREE.Object3D[] = (n as any).getPorts?.() ?? [];
          ports.push(...list);
        }
        return ports;
      },
      props.onCreateEdge
    );

    // ⭐ 仲裁：画线期间禁用 orbit
    edgeDraw.onBegin(() => (orbit.enabled = false));
    edgeDraw.onEnd(() => (orbit.enabled = true));
    edgeDraw.onCancel(() => (orbit.enabled = true));

    /* ---------- Selection ---------- */

    const onPointerDown = (ev: PointerEvent) => {
      if (edgeDraw.isActive()) return;
      if (ev.shiftKey) return;
      hideContextMenu(r);

      const rect = renderer.domElement.getBoundingClientRect();
      r.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      r.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      r.raycaster.setFromCamera(r.pointer, camera);
      const monitorHits = r.monitorHandles
        ? r.raycaster.intersectObjects(r.monitorHandles.children, true)
        : [];

      if (monitorHits.length > 0) {
        let o: THREE.Object3D | null = monitorHits[0].object;
        while (o && o.userData?.kind !== 'monitor-point') o = o.parent;
        if (o) {
          const targetId = o.userData.targetId as string;
          const target = o.userData.target as 'node' | 'edge';
          propsRef.current.onSelect({ kind: target === 'node' ? 'node' : 'edge', id: targetId });
          transform.attach(o);
          return;
        }
      }

      const portHits = r.raycaster.intersectObjects([...r.nodeObj.values()], true);
      if (portHits.length > 0) {
        let o: THREE.Object3D | null = portHits[0].object;
        while (o && o.userData?.kind !== 'port' && !(o as any).userData?.id) o = o.parent;
        if (o && o.userData?.kind === 'port') {
          const nodeId = o.userData.nodeId as string;
          propsRef.current.onSelect({ kind: 'node', id: nodeId });
          transform.attach(o);
          return;
        }
      }

      const handleHits = r.edgeHandles
        ? r.raycaster.intersectObjects(r.edgeHandles.children, true)
        : [];

      if (handleHits.length > 0) {
        let o: THREE.Object3D | null = handleHits[0].object;
        while (o && o.userData?.kind !== 'edge-point') o = o.parent;
        if (o) {
          const edgeId = o.userData.edgeId as string;
          propsRef.current.onSelect({ kind: 'edge', id: edgeId });
          transform.attach(o);
          return;
        }
      }

      const hits = r.raycaster.intersectObjects([...r.nodeObj.values()], true);
      if (hits.length > 0) {
        let o: THREE.Object3D | null = hits[0].object;
        while (o && !(o as any).userData?.id) o = o.parent;
        const id = (o as any)?.userData?.id;
        if (id) {
          propsRef.current.onSelect({ kind: 'node', id });
          const target = r.nodeObj.get(id);
          if (target) transform.attach(target);
        }
        return;
      }

      const edgeHits = r.raycaster.intersectObjects([...r.pipeObj.values()], true);
      if (edgeHits.length > 0) {
        const hit = edgeHits[0];
        let o: THREE.Object3D | null = hit.object;
        while (o && o.userData?.kind !== 'edge') o = o.parent;
        const edgeId = o?.userData?.edgeId as string | undefined;
        if (edgeId) {
          propsRef.current.onSelect({ kind: 'edge', id: edgeId });
          transform.detach();
          return;
        }
      }

      propsRef.current.onSelect({ kind: 'none' });
      transform.detach();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onContextMenu = (ev: MouseEvent) => {
      if (edgeDraw.isActive()) return;
      ev.preventDefault();

      const rect = renderer.domElement.getBoundingClientRect();
      r.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      r.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      r.raycaster.setFromCamera(r.pointer, camera);

      const monitorHits = r.monitorHandles
        ? r.raycaster.intersectObjects(r.monitorHandles.children, true)
        : [];

      if (monitorHits.length > 0) {
        let o: THREE.Object3D | null = monitorHits[0].object;
        while (o && o.userData?.kind !== 'monitor-point') o = o.parent;
        if (o) {
          const targetId = o.userData.targetId as string;
          const target = o.userData.target as 'node' | 'edge';
          const index = o.userData.index as number;
          propsRef.current.onSelect({ kind: target === 'node' ? 'node' : 'edge', id: targetId });
          r.contextTarget = { kind: 'monitor-delete', target, targetId, index };
          if (r.contextMenu) {
            (r.contextMenu.children[0] as HTMLButtonElement).style.display = 'none';
            (r.contextMenu.children[1] as HTMLButtonElement).style.display = 'none';
            (r.contextMenu.children[2] as HTMLButtonElement).style.display = 'none';
            (r.contextMenu.children[3] as HTMLButtonElement).style.display = 'block';
          }
          showContextMenu(r, ev.clientX - rect.left, ev.clientY - rect.top);
          return;
        }
      }

      const handleHits = r.edgeHandles
        ? r.raycaster.intersectObjects(r.edgeHandles.children, true)
        : [];

      if (handleHits.length > 0) {
        let o: THREE.Object3D | null = handleHits[0].object;
        while (o && o.userData?.kind !== 'edge-point') o = o.parent;
        if (o) {
          const edgeId = o.userData.edgeId as string;
          const index = o.userData.index as number;
          propsRef.current.onSelect({ kind: 'edge', id: edgeId });
          r.contextTarget = { kind: 'edge-control-delete', edgeId, index };
          if (r.contextMenu) {
            (r.contextMenu.children[0] as HTMLButtonElement).style.display = 'none';
            (r.contextMenu.children[1] as HTMLButtonElement).style.display = 'block';
            (r.contextMenu.children[2] as HTMLButtonElement).style.display = 'none';
            (r.contextMenu.children[3] as HTMLButtonElement).style.display = 'none';
          }
          showContextMenu(r, ev.clientX - rect.left, ev.clientY - rect.top);
          return;
        }
      }

      const nodeHits = r.raycaster.intersectObjects([...r.nodeObj.values()], true);
      if (nodeHits.length > 0) {
        let o: THREE.Object3D | null = nodeHits[0].object;
        while (o && !(o as any).userData?.id) o = o.parent;
        const id = (o as any)?.userData?.id as string | undefined;
        if (id) {
          propsRef.current.onSelect({ kind: 'node', id });
          const node = r.nodeObj.get(id);
          if (node) {
            const local = node.worldToLocal(nodeHits[0].point.clone());
            r.contextTarget = { kind: 'monitor-insert', target: 'node', targetId: id, point: local };
            if (r.contextMenu) {
              (r.contextMenu.children[0] as HTMLButtonElement).style.display = 'none';
              (r.contextMenu.children[1] as HTMLButtonElement).style.display = 'none';
              (r.contextMenu.children[2] as HTMLButtonElement).style.display = 'block';
              (r.contextMenu.children[3] as HTMLButtonElement).style.display = 'none';
            }
            showContextMenu(r, ev.clientX - rect.left, ev.clientY - rect.top);
            return;
          }
        }
      }

      const edgeHits = r.raycaster.intersectObjects([...r.pipeObj.values()], true);
      if (edgeHits.length > 0) {
        const hit = edgeHits[0];
        let o: THREE.Object3D | null = hit.object;
        while (o && o.userData?.kind !== 'edge') o = o.parent;
        const edgeId = o?.userData?.edgeId as string | undefined;
        if (edgeId) {
          propsRef.current.onSelect({ kind: 'edge', id: edgeId });
          const insert = computeInsertIndex(r, edgeId, hit.point);
          if (insert) {
            r.contextTarget = { kind: 'edge-control-insert', edgeId, insertIndex: insert.insertIndex, point: insert.point };
            if (r.contextMenu) {
              (r.contextMenu.children[0] as HTMLButtonElement).style.display = 'block';
              (r.contextMenu.children[1] as HTMLButtonElement).style.display = 'none';
              (r.contextMenu.children[2] as HTMLButtonElement).style.display = 'block';
              (r.contextMenu.children[3] as HTMLButtonElement).style.display = 'none';
            }
            showContextMenu(r, ev.clientX - rect.left, ev.clientY - rect.top);
            return;
          }
        }
      }

      hideContextMenu(r);
    };

    const onDocPointerDown = () => hideContextMenu(r);

    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerdown', onDocPointerDown);

    const loop = () => {
      requestAnimationFrame(loop);
      orbit.update();
      const dt = 1 / 60;
      for (const n of r.nodeObj.values()) (n as any).update?.(dt);
      for (const p of r.pipeObj.values()) p.update(dt);
      updateGroupBoxes(r);

      const t = performance.now() / 1000;
      if (r.monitorGroup) {
        for (const s of r.monitorGroup.children) {
          const sprite = s as THREE.Sprite;
          const flash = sprite.userData?.flash;
          if (!flash) continue;
          const mat = sprite.material as THREE.SpriteMaterial;
          mat.opacity = 0.35 + 0.65 * Math.abs(Math.sin(t * 5));
          mat.transparent = true;
        }
      }
      renderer.render(scene, camera);
    };
    loop();

    r.renderer = renderer;
    r.scene = scene;
    r.camera = camera;
    r.orbit = orbit;
    r.transform = transform;
    r.edgeDraw = edgeDraw;
    r.edgeHandles = edgeHandles;
    r.monitorGroup = monitorGroup;
    r.monitorHandles = monitorHandles;
    r.groupBoxes = groupBoxes;
    r.contextMenu = menu;

    return () => {
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerdown', onDocPointerDown);
      edgeDraw.dispose();
      hideContextMenu(r);
      menu.remove();
      host.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  /* ============================
   * Rebuild on graph change
   * ========================== */

  useEffect(() => {
    const r = rt.current;
    if (!r.scene) return;

    for (const n of r.nodeObj.values()) r.scene.remove(n);
    for (const p of r.pipeObj.values()) r.scene.remove(p);
    r.nodeObj.clear();
    r.pipeObj.clear();

    for (const n of props.graph.nodes) {
      const obj =
        n.type === 'router'
          ? new RouterNode(n.id, { inputs: n.inputs, outputs: n.outputs })
          : new BasicNode(n.id, n.modelUrl, { inputs: n.inputs, outputs: n.outputs });
      obj.userData.id = n.id;
      (obj as any).modelUrl = n.modelUrl;
      obj.position.set(n.position.x, n.position.y, n.position.z);
      (obj as any).setLabelText?.(n.label ?? n.id);

      r.scene.add(obj);
      r.nodeObj.set(n.id, obj);
    }

    for (const e of props.graph.edges) {
      const fromNode = r.nodeObj.get(e.from)!;
      const toNode = r.nodeObj.get(e.to)!;

      const fromPort = resolvePort(fromNode, 'out', e.fromPortId);
      const toPort = resolvePort(toNode, 'in', e.toPortId);
      if (!fromPort || !toPort) continue;

      const waypoints = e.points?.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const pipe = new PipelineObject(fromPort, toPort, SubstanceType.SOLID, waypoints);
      pipe.userData.kind = 'edge';
      pipe.userData.edgeId = e.id;
      r.scene.add(pipe);
      r.pipeObj.set(e.id, pipe);
    }

    if (r.groupBoxes) {
      r.groupBoxes.clear();
      r.groupBoxMap.clear();
      const groups = props.graph.groups ?? [];
      const geo = new THREE.BoxGeometry(1, 1, 1);
      for (const g of groups) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.groupId = g.id;
        r.groupBoxes.add(mesh);
        r.groupBoxMap.set(g.id, mesh);
      }
    }
  }, [props.graph]);

  /* ============================
   * Edge handles (selected edge)
   * ========================== */

  useEffect(() => {
    const r = rt.current;
    if (!r.edgeHandles) return;

    clearEdgeHandles(r.edgeHandles);

    if (props.selection.kind !== 'edge') return;
    const edge = props.graph.edges.find((e) => e.id === props.selection.id);
    if (!edge?.points || edge.points.length === 0) return;

    for (let i = 0; i < edge.points.length; i++) {
      const p = edge.points[i];
      const geo = new THREE.SphereGeometry(0.22, 12, 12);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0x9a3412,
        emissiveIntensity: 0.65,
        roughness: 0.35,
        metalness: 0.05,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, p.y, p.z);
      m.userData.kind = 'edge-point';
      m.userData.edgeId = edge.id;
      m.userData.index = i;
      r.edgeHandles.add(m);
    }
  }, [props.graph, props.selection]);

  /* ============================
   * Monitor handles (edit)
   * ========================== */

  useEffect(() => {
    const r = rt.current;
    if (!r.monitorHandles) return;

    clearEdgeHandles(r.monitorHandles);

    if (props.selection.kind === 'node') {
      const node = props.graph.nodes.find((n) => n.id === props.selection.id);
      const nodeObj = r.nodeObj.get(props.selection.id);
      if (!node || !nodeObj || !node.monitorPoints?.length) return;

      for (let i = 0; i < node.monitorPoints.length; i++) {
        const mp = node.monitorPoints[i];
        const geo = new THREE.SphereGeometry(0.18, 12, 12);
        const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9 });
        const m = new THREE.Mesh(geo, mat);
        const offset = mp.offset ?? { x: 0, y: 1.1, z: 0 };
        const pos = new THREE.Vector3(offset.x, offset.y, offset.z);
        nodeObj.localToWorld(pos);
        m.position.copy(pos);
        m.userData.kind = 'monitor-point';
        m.userData.target = 'node';
        m.userData.targetId = node.id;
        m.userData.index = i;
        r.monitorHandles.add(m);
      }
      return;
    }

    if (props.selection.kind === 'edge') {
      const edge = props.graph.edges.find((e) => e.id === props.selection.id);
      const pipe = edge ? r.pipeObj.get(edge.id) : null;
      if (!edge || !pipe || !edge.monitorPoints?.length) return;

      for (let i = 0; i < edge.monitorPoints.length; i++) {
        const mp = edge.monitorPoints[i];
        const geo = new THREE.SphereGeometry(0.18, 12, 12);
        const mat = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xc2410c });
        const m = new THREE.Mesh(geo, mat);
        const pos = pipe.getPointAt(mp.t);
        m.position.copy(pos);
        m.userData.kind = 'monitor-point';
        m.userData.target = 'edge';
        m.userData.targetId = edge.id;
        m.userData.index = i;
        r.monitorHandles.add(m);
      }
    }
  }, [props.graph, props.selection]);

  /* ============================
   * Monitoring points (mock data)
   * ========================== */

  useEffect(() => {
    const r = rt.current;
    if (!r.monitorGroup) return;

    clearMonitorGroup(r.monitorGroup);

    const values = props.monitoring.points;
    const nodeRun = props.monitoring.nodes ?? {};
    const nodeState = new Map<string, 'normal' | 'warn' | 'alert'>();
    const nodeRunning = new Map<string, boolean>();
    const nodeAnimation = new Map<string, string | null>();

    // node monitor points
    for (const n of props.graph.nodes) {
      const nodeObj = r.nodeObj.get(n.id);
      if (!nodeObj || !n.monitorPoints?.length) continue;

      let hasAlert = false;
      let hasWarn = false;
      let running = false;
      let chosenClip: string | null = null;

      for (const mp of n.monitorPoints) {
        const v = values[mp.id];
        if (!v) continue;

        const metric = mp.metric ?? 'temperature';
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
        if (value == null) continue;

        const thresholds = mp.thresholds;
        const numericValue = typeof value === 'number' ? value : undefined;
        const alert =
          numericValue != null &&
          ((thresholds?.high != null && numericValue > thresholds.high) ||
            (thresholds?.low != null && numericValue < thresholds.low));
        const warn =
          !alert &&
          numericValue != null &&
          ((thresholds?.high != null && numericValue > thresholds.high * 0.9) ||
            (thresholds?.low != null && numericValue < thresholds.low * 1.1));

        if (alert) hasAlert = true;
        if (warn) hasWarn = true;

        const color =
          alert
            ? 0xef4444
            : v.color ?? (v.substance ? SubstanceColor[v.substance] : 0xe2e8f0);

        const lines: string[] = [];
        if (mp.label) lines.push(mp.label);
        lines.push(formatMetric(metric, value));
        const text = lines.join(' | ');

        const sprite = createMonitorSprite(text, color);
        sprite.userData.flash = alert && (thresholds?.flash ?? true);
        const offset = mp.offset ?? { x: 0, y: 1.1, z: 0 };
        const pos = new THREE.Vector3(offset.x, offset.y, offset.z);
        nodeObj.localToWorld(pos);
        sprite.position.copy(pos);
        r.monitorGroup.add(sprite);
      }

      if (nodeRun[n.id]?.running === true) running = true;

      if (n.animationBindings?.length && nodeRun[n.id]?.data) {
        const data = nodeRun[n.id]!.data!;
        for (const b of n.animationBindings) {
          const v = data[b.field];
          if (v == null) continue;
          if (b.op === 'eq' && v === b.value) {
            chosenClip = b.clip;
            break;
          }
          if (b.op === 'gt' && typeof v === 'number' && typeof b.value === 'number' && v > b.value) {
            chosenClip = b.clip;
            break;
          }
          if (b.op === 'lt' && typeof v === 'number' && typeof b.value === 'number' && v < b.value) {
            chosenClip = b.clip;
            break;
          }
        }
      }

      nodeState.set(n.id, hasAlert ? 'alert' : hasWarn ? 'warn' : 'normal');
      nodeRunning.set(n.id, running);
      nodeAnimation.set(n.id, chosenClip);
    }

    // edge monitor points
    for (const e of props.graph.edges) {
      const pipe = r.pipeObj.get(e.id);
      if (!pipe || !e.monitorPoints?.length) continue;

      for (const mp of e.monitorPoints) {
        const v = values[mp.id];
        if (!v) continue;

        const metric = mp.metric ?? 'flowRate';
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
        if (value == null) continue;

        const thresholds = mp.thresholds;
        const numericValue = typeof value === 'number' ? value : undefined;
        const alert =
          numericValue != null &&
          ((thresholds?.high != null && numericValue > thresholds.high) ||
            (thresholds?.low != null && numericValue < thresholds.low));

        const color =
          alert
            ? 0xef4444
            : v.color ?? (v.substance ? SubstanceColor[v.substance] : 0xe2e8f0);

        const lines: string[] = [];
        if (mp.label) lines.push(mp.label);
        lines.push(formatMetric(metric, value));
        const text = lines.join(' | ');

        const sprite = createMonitorSprite(text, color);
        sprite.userData.flash = alert && (thresholds?.flash ?? true);
        const t = Math.max(0, Math.min(1, mp.t));
        const pos = pipe.getPointAt(t);
        sprite.position.copy(pos);
        r.monitorGroup.add(sprite);
      }
    }

    for (const [id, obj] of r.nodeObj) {
      const state = nodeState.get(id) ?? 'normal';
      (obj as any).setVisualState?.(state);
      (obj as any).setRunning?.(nodeRunning.get(id) ?? false);
      (obj as any).setAnimationByName?.(nodeAnimation.get(id) ?? null);
    }
  }, [props.graph, props.monitoring]);

  return <div ref={hostRef} className="viewport" />;
}
