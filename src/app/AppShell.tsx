import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { createApp } from "./createApp";

import { useGraph } from "../ui/hooks/useGraph";
import { useSelection } from "../ui/hooks/useSelection";

import { Toolbar } from "../ui/components/Toolbar";
import { Palette } from "../ui/components/Palette";
import { Inspector } from "../ui/components/Inspector";
import { StatusBar } from "../ui/components/StatusBar";
import { ThreeViewport } from "../render/ThreeViewport";

import { getViewCenterOnPlane } from "../render/utils/getViewCenterOnPlane";

import type {
  FlowGraphV1,
  FlowNodeV1,
  FlowEdgeV1,
  FlowMonitoringV1,
} from "../runtime/workerProtocol";

import { SubstanceColor, SubstanceType } from "../core/Substance";
import { AddNodeCommand } from "../editor/history/commands/AddNodeCommand";
import { DeleteNodeCommand } from "../editor/history/commands/DeleteNodeCommand";
import { MoveNodeCommand } from "../editor/history/commands/MoveNodeCommand";
import { UpdateNodeCommand } from "../editor/history/commands/UpdateNodeCommand";
import { AddEdgeCommand } from "../editor/history/commands/AddEdgeCommand";
import { DeleteEdgeCommand } from "../editor/history/commands/DeleteEdgeCommand";
import { UpdateEdgeCommand } from "../editor/history/commands/UpdateEdgeCommand";

export function AppShell() {
  /* =========================================================
   * App bootstrap
   * ======================================================= */

  const app = useMemo(() => createApp(), []);
  const graph = useGraph(app.graphStore);
  const { sel, setSel } = useSelection();

  /* =========================================================
   * Camera ref (spawn at view center)
   * ======================================================= */

  const cameraRef = useRef<THREE.Camera | null>(null);

  const [monitoring, setMonitoring] = useState<FlowMonitoringV1>({
    points: {},
    nodes: {},
  });

  /* =========================================================
   * FPS counter
   * ======================================================= */

  const [fps, setFps] = useState(60);
  const frameRef = useRef({ last: performance.now(), frames: 0 });

  /* =========================================================
   * Mock monitoring data
   * ======================================================= */

  const monitorMeta = useMemo(() => {
    const meta = new Map<string, { metric: "temperature" | "humidity" | "flowRate" | "substance" }>();
    for (const n of graph.nodes) {
      n.monitorPoints?.forEach((p) =>
        meta.set(p.id, { metric: (p.metric as any) ?? "temperature" })
      );
    }
    for (const e of graph.edges) {
      e.monitorPoints?.forEach((p) =>
        meta.set(p.id, { metric: (p.metric as any) ?? "flowRate" })
      );
    }
    return meta;
  }, [graph]);

  useEffect(() => {
    setMonitoring((prev) => {
      const next: FlowMonitoringV1 = {
        points: { ...prev.points },
        nodes: { ...(prev.nodes ?? {}) },
      };
      for (const n of graph.nodes) {
        if (!next.nodes![n.id]) next.nodes![n.id] = { running: true, data: { state: "running", alarm: false } };
      }
      for (const [id, meta] of monitorMeta) {
        if (!next.points[id]) {
          if (meta.metric === "temperature") {
            next.points[id] = { temperature: 62 + Math.random() * 8 };
          } else if (meta.metric === "humidity") {
            next.points[id] = { humidity: 82 + Math.random() * 12 };
          } else if (meta.metric === "flowRate") {
            next.points[id] = { flowRate: 14 + Math.random() * 6 };
          } else if (meta.metric === "substance") {
            const substance = Math.random() > 0.5 ? SubstanceType.LIQUID : SubstanceType.GAS;
            next.points[id] = { substance, color: SubstanceColor[substance] };
          }
        }
      }
      return next;
    });
  }, [monitorMeta]);

  useEffect(() => {
    const timer = setInterval(() => {
      setMonitoring((prev) => {
        const next: FlowMonitoringV1 = {
          points: { ...prev.points },
          nodes: { ...(prev.nodes ?? {}) },
        };
        for (const n of graph.nodes) {
          if (!next.nodes![n.id]) next.nodes![n.id] = { running: true, data: { state: "running", alarm: false } };
        }
        for (const [id, meta] of monitorMeta) {
          const v = next.points[id];
          if (!v) continue;
          if (meta.metric === "temperature" && typeof v.temperature === "number") {
            v.temperature += (Math.random() - 0.5) * 1.2;
          } else if (meta.metric === "humidity" && typeof v.humidity === "number") {
            v.humidity += (Math.random() - 0.5) * 2.0;
          } else if (meta.metric === "flowRate" && typeof v.flowRate === "number") {
            v.flowRate += (Math.random() - 0.5) * 1.6;
          } else if (meta.metric === "substance" && v.substance && Math.random() < 0.05) {
            const nextSub =
              v.substance === SubstanceType.LIQUID ? SubstanceType.GAS : SubstanceType.LIQUID;
            v.substance = nextSub;
            v.color = SubstanceColor[nextSub];
          }
        }
        for (const n of graph.nodes) {
          if (Math.random() < 0.03) {
            const cur = next.nodes![n.id]?.running ?? false;
            const data = next.nodes![n.id]?.data ?? { state: "running", alarm: false };
            const running = !cur;
            next.nodes![n.id] = {
              running,
              data: {
                ...data,
                state: running ? "running" : "idle",
                alarm: Math.random() < 0.2,
              },
            };
          }
        }
        return next;
      });
    }, 900);

    return () => clearInterval(timer);
  }, [monitorMeta]);

  /* =========================================================
   * FPS sampling
   * ======================================================= */

  useEffect(() => {
    const statTimer = setInterval(() => {
      const now = performance.now();
      const { last, frames } = frameRef.current;
      const dt = (now - last) / 1000;
      if (dt > 0) setFps(frames / dt);
      frameRef.current.last = now;
      frameRef.current.frames = 0;
    }, 500);

    let raf = 0;
    const loop = () => {
      frameRef.current.frames++;
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      clearInterval(statTimer);
      cancelAnimationFrame(raf);
    };
  }, []);

  /* =========================================================
   * Undo / Redo shortcuts
   * ======================================================= */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const key = e.key.toLowerCase();

      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) app.history.redo();
        else app.history.undo();
      }

      if (key === "y") {
        e.preventDefault();
        app.history.redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [app]);

  /* =========================================================
   * Helpers
   * ======================================================= */

  const selectedNodeId = sel.kind === "node" ? sel.id : undefined;

  const getSpawnPos = (planeY: number) => {
    const cam = cameraRef.current;
    if (!cam) return { x: 0, y: planeY, z: 0 };
    const p = getViewCenterOnPlane(cam, planeY);
    return { x: p.x, y: p.y, z: p.z };
  };

  /* =========================================================
   * Toolbar actions
   * ======================================================= */

  const onSave = () => {
    const blob = new Blob([JSON.stringify(app.graphStore.get(), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "flow-graph.json";
    a.click();
  };

  const onLoad = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const g = JSON.parse(await f.text()) as FlowGraphV1;
      app.graphStore.set(g);
      app.history.clear();
      setSel({ kind: "none" });
    };
    input.click();
  };

  /* =========================================================
   * Palette handlers
   * ======================================================= */

  const onSelectNode = (id: string) => {
    setSel({ kind: "node", id });
  };

  const onAddBasic = () => {
    const pos = getSpawnPos(0.6);
    const id = `N${graph.nodes.length + 1}`;

    const node: FlowNodeV1 = {
      id,
      label: id,
      type: "basic",
      position: pos,
      inputs: [{ id: "in", direction: "in", position: { x: -1.3, y: 0.0, z: 0.0 } }],
      outputs: [{ id: "out", direction: "out", position: { x: 1.3, y: 0.0, z: 0.0 } }],
    };

    app.history.execute(new AddNodeCommand(node));
    setSel({ kind: "node", id });
  };

  const onAddRouter = () => {
    const pos = getSpawnPos(1.1);
    const id = `R${graph.nodes.filter((n) => n.type === "router").length + 1}`;

    const node: FlowNodeV1 = {
      id,
      label: id,
      type: "router",
      position: pos,
      inputs: [{ id: "in", direction: "in", position: { x: 0.0, y: 0.0, z: -1.2 } }],
      outputs: [
        { id: "out-true", direction: "out", position: { x: 1.2, y: 0.0, z: 0.0 } },
        { id: "out-false", direction: "out", position: { x: -1.2, y: 0.0, z: 0.0 } },
      ],
    };

    app.history.execute(new AddNodeCommand(node));
    setSel({ kind: "node", id });
  };

  const onUpdateNode = (id: string, patch: Partial<FlowNodeV1>) => {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) return;

    app.history.execute(
      new UpdateNodeCommand(id, structuredClone(patch), structuredClone(patch))
    );
  };

  const onDeleteNode = (id: string) => {
    app.history.execute(new DeleteNodeCommand(graph, id));
    setSel({ kind: "none" });
  };

  const onDeleteEdge = (edgeId: string) => {
    const edge = graph.edges.find((e) => e.id === edgeId);
    if (!edge) return;
    app.history.execute(new DeleteEdgeCommand(edge));
    setSel({ kind: "none" });
  };

  /* =========================================================
   * Edge creation / update
   * ======================================================= */

  const onCreateEdge = (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => {
    if (fromNodeId === toNodeId) return;
    if (graph.edges.some((e) => e.from === fromNodeId && e.to === toNodeId && e.fromPortId === fromPortId && e.toPortId === toPortId))
      return;

    const id = `E${graph.edges.length + 1}`;
    const edge: FlowEdgeV1 = {
      id,
      from: fromNodeId,
      fromPortId,
      to: toNodeId,
      toPortId,
      capacityPerSec: 10,
      delaySec: 0.5,
    };

    app.history.execute(new AddEdgeCommand(edge));
    setSel({ kind: "edge", id });
  };

  const onUpdateEdge = (edgeId: string, patch: Partial<FlowEdgeV1>) => {
    const edge = graph.edges.find((e) => e.id === edgeId);
    if (!edge) return;

    app.history.execute(
      new UpdateEdgeCommand(
        edgeId,
        structuredClone(patch),
        structuredClone(patch)
      )
    );
  };

  /* =========================================================
   * Node move (TransformControls mouseUp)
   * ======================================================= */

  const onMoveNode = (
    id: string,
    position: { x: number; y: number; z: number }
  ) => {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) return;

    app.history.execute(
      new MoveNodeCommand(
        id,
        structuredClone(node.position),
        structuredClone(position)
      )
    );
  };

  /* =========================================================
   * Render
   * ======================================================= */

  return (
    <div className="shell">
      <Toolbar
        onSave={onSave}
        onLoad={onLoad}
      />

      <div className="body">
        <div className="left">
          <Palette
            graph={graph}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            onAddBasic={onAddBasic}
            onAddRouter={onAddRouter}
            onDeleteNode={onDeleteNode}
            onDeleteEdge={onDeleteEdge}
          />
        </div>

        <div className="center">
          <ThreeViewport
            store={app.graphStore}
            graph={graph}
            monitoring={monitoring}
            selection={sel}
            onSelect={setSel}
            exposeCamera={(cam) => (cameraRef.current = cam)}
            onCreateEdge={onCreateEdge}
            onUpdateEdge={onUpdateEdge}
            onUpdateNode={onUpdateNode}
            onMoveNode={onMoveNode}
          />
        </div>

        <div className="right">
          <Inspector
            graph={graph}
            monitoring={monitoring}
            selection={sel}
            onUpdateNode={onUpdateNode}
            onUpdateEdge={onUpdateEdge}
          />
        </div>
      </div>

      <StatusBar
        fps={fps}
        nodes={graph.nodes.length}
        edges={graph.edges.length}
      />
    </div>
  );
}
