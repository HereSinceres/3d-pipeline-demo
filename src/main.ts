import * as THREE from "three";
import "./style.css";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

import { SubstanceType } from "./core/Substance";
import { BasicNode } from "./nodes/BasicNode";
import { RouterNode } from "./nodes/RouterNode";
import { PipelineObject } from "./objects/PipelineObject";

import type { FlowGraphV1, SimOutMsg } from "./runtime/workerProtocol";
import { CodeToNodeState } from "./runtime/workerProtocol";

/* =========================================================
 * Scene / Renderer
 * ======================================================= */

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(12, 10, 16);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const dir = new THREE.DirectionalLight(0xffffff, 1.1);
dir.position.set(10, 18, 10);
scene.add(dir);

const grid = new THREE.GridHelper(40, 40, 0x334155, 0x1f2937);
const gm: any = grid.material;
if (Array.isArray(gm))
  gm.forEach((m: any) => {
    m.opacity = 0.35;
    m.transparent = true;
  });
else {
  gm.opacity = 0.35;
  gm.transparent = true;
}
scene.add(grid);

/* =========================================================
 * Controls
 * ======================================================= */

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;

const transform = new TransformControls(camera, renderer.domElement);
transform.setMode("translate");
transform.addEventListener("dragging-changed", (e) => {
  orbit.enabled = !e.value;
});
scene.add(transform.getHelper());

/* =========================================================
 * Visual Graph (Three)
 * ======================================================= */

const nodeA = new BasicNode("Feed");
nodeA.userData.id = "A";
nodeA.position.set(-8, 0.6, 0);
const router = new RouterNode();
router.userData.id = "R";
router.position.set(0, 1.1, 0);
const nodeB = new BasicNode("Reactor");
nodeB.userData.id = "B";
nodeB.position.set(8, 0.6, 0);
const nodeC = new BasicNode("Separator");
nodeC.userData.id = "C";
nodeC.position.set(8, 0.6, -8);

scene.add(nodeA, router, nodeB, nodeC);

const substance = SubstanceType.LIQUID;

const pipeAR = new PipelineObject(nodeA.output, router.input, substance);
const pipeRB = new PipelineObject(router.outTrue, nodeB.input, substance);
const pipeRC = new PipelineObject(router.outFalse, nodeC.input, substance);
scene.add(pipeAR, pipeRB, pipeRC);

// default drag
transform.attach(nodeA.getDraggable());

/* =========================================================
 * Graph JSON (v1) - used for worker init + save/load
 * ======================================================= */

let graph: FlowGraphV1 = {
  version: 1,
  nodes: [
    {
      id: "A",
      type: "basic",
      position: {
        x: nodeA.position.x,
        y: nodeA.position.y,
        z: nodeA.position.z,
      },
      runtime: {
        inCapacity: 100,
        outCapacity: 100,
        processRatePerSec: 20,
        startThreshold: 1,
      },
    },
    {
      id: "R",
      type: "router",
      position: {
        x: router.position.x,
        y: router.position.y,
        z: router.position.z,
      },
    },
    {
      id: "B",
      type: "basic",
      position: {
        x: nodeB.position.x,
        y: nodeB.position.y,
        z: nodeB.position.z,
      },
      runtime: {
        inCapacity: 40,
        outCapacity: 40,
        processRatePerSec: 10,
        startThreshold: 1,
        process: { yield: { liquid: { gas: 0.7, liquid: 0.2 } } },
      },
    },
    {
      id: "C",
      type: "basic",
      position: {
        x: nodeC.position.x,
        y: nodeC.position.y,
        z: nodeC.position.z,
      },
      runtime: {
        inCapacity: 30,
        outCapacity: 30,
        processRatePerSec: 8,
        startThreshold: 1,
      },
    },
  ],
  edges: [
    { id: "AR", from: "A", to: "R", capacityPerSec: 18, delaySec: 0.35 },
    // Router outgoing edges order matters for strict gating: [trueEdge, falseEdge]
    { id: "RB", from: "R", to: "B", capacityPerSec: 12, delaySec: 0.6 },
    { id: "RC", from: "R", to: "C", capacityPerSec: 10, delaySec: 0.6 },
  ],
  routers: [{ id: "R", condition: true }],
};

/* =========================================================
 * Worker
 * ======================================================= */

const simWorker = new Worker(
  new URL("./workers/sim.worker.ts", import.meta.url),
  { type: "module" }
);

// id->index
let nodeIds: string[] = [];
let edgeIds: string[] = [];
let nodeIdx = new Map<string, number>();
let edgeIdx = new Map<string, number>();

// latest binary buffers
let bufStates: Int8Array | null = null;
let bufInTotal: Float32Array | null = null;
let bufOutTotal: Float32Array | null = null;
let bufLiquidIn: Float32Array | null = null;
let bufGasOut: Float32Array | null = null;

let bufEdgeActive: Int8Array | null = null;
let bufEdgeInFlight: Float32Array | null = null;

simWorker.onmessage = (ev: MessageEvent<SimOutMsg>) => {
  const msg = ev.data;

  if (msg.type === "SIM_READY") {
    nodeIds = msg.nodeIds;
    edgeIds = msg.edgeIds;
    nodeIdx = new Map(nodeIds.map((id, i) => [id, i]));
    edgeIdx = new Map(edgeIds.map((id, i) => [id, i]));
    return;
  }

  if (msg.type === "SIM_ERROR") {
    console.error("[Worker]", msg.message);
    return;
  }

  if (msg.type === "SIM_SNAPSHOT_BIN") {
    bufStates = new Int8Array(msg.nodeStates);
    bufInTotal = new Float32Array(msg.nodeInTotal);
    bufOutTotal = new Float32Array(msg.nodeOutTotal);
    bufLiquidIn = new Float32Array(msg.nodeLiquidIn);
    bufGasOut = new Float32Array(msg.nodeGasOut);

    bufEdgeActive = new Int8Array(msg.edgeActive);
    bufEdgeInFlight = new Float32Array(msg.edgeInFlight);
    return;
  }
};

function initWorker() {
  simWorker.postMessage({ type: "SIM_INIT", graph });
  // 大图建议：tick 120/240，publish 10~20
  simWorker.postMessage({
    type: "SIM_SET_RATE",
    tickHz: 120,
    publishHz: 20,
    publishIds: false,
  });
}
initWorker();

/* =========================================================
 * HUD
 * ======================================================= */

const hud = document.createElement("div");
hud.className = "hud";
hud.innerHTML = `
  <h1>Strict Gating + Big Graph Worker</h1>
  <div class="row">
    <button id="dragA">Drag Feed</button>
    <button id="dragB">Drag Reactor</button>
    <button id="dragR">Drag Router</button>
  </div>
  <div class="row">
    <button id="toggleRoute">Toggle Route</button>
    <button id="saveFlow">Save JSON</button>
    <button id="loadFlow">Load JSON</button>
  </div>
  <div class="hint">
    • Strict gating: inactive edges DO NOT flow in worker<br/>
    • Binary snapshots: low GC for large graphs
  </div>
`;
app.appendChild(hud);

(hud.querySelector("#dragA") as HTMLButtonElement).onclick = () =>
  transform.attach(nodeA.getDraggable());
(hud.querySelector("#dragB") as HTMLButtonElement).onclick = () =>
  transform.attach(nodeB.getDraggable());
(hud.querySelector("#dragR") as HTMLButtonElement).onclick = () =>
  transform.attach(router.body);

(hud.querySelector("#toggleRoute") as HTMLButtonElement).onclick = () => {
  router.condition = !router.condition;
  const r = graph.routers?.find((x) => x.id === "R");
  if (r) r.condition = router.condition;

  // strict gating happens in worker
  simWorker.postMessage({
    type: "SIM_SET_ROUTER",
    id: "R",
    condition: router.condition,
  });
};

(hud.querySelector("#saveFlow") as HTMLButtonElement).onclick = () => {
  // update positions
  graph = {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const obj =
        n.id === "A"
          ? nodeA
          : n.id === "R"
          ? router
          : n.id === "B"
          ? nodeB
          : nodeC;
      return {
        ...n,
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      };
    }),
  };

  const blob = new Blob([JSON.stringify(graph, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "flow-graph.json";
  a.click();
};

(hud.querySelector("#loadFlow") as HTMLButtonElement).onclick = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;

    graph = JSON.parse(await f.text()) as FlowGraphV1;

    // restore positions
    for (const n of graph.nodes) {
      const obj =
        n.id === "A"
          ? nodeA
          : n.id === "R"
          ? router
          : n.id === "B"
          ? nodeB
          : nodeC;
      obj.position.set(n.position.x, n.position.y, n.position.z);
    }

    // restore router condition
    router.condition =
      graph.routers?.find((x) => x.id === "R")?.condition ?? true;

    // re-init worker
    initWorker();
  };
  input.click();
};

/* =========================================================
 * Feed → Worker
 * ======================================================= */

let feedAcc = 0;
function pushFeed(dt: number) {
  feedAcc += dt;
  if (feedAcc >= 0.25) {
    feedAcc = 0;
    simWorker.postMessage({
      type: "SIM_FEED",
      nodeId: "A",
      bag: { solid: 0, liquid: 8, gas: 0, data: 0 },
    });
  }
}

/* =========================================================
 * Apply binary snapshot to visuals
 * ======================================================= */

function applySnapshotToVisuals() {
  if (
    !bufStates ||
    !bufLiquidIn ||
    !bufGasOut ||
    !bufEdgeActive ||
    !bufEdgeInFlight
  )
    return;
  if (nodeIds.length === 0 || edgeIds.length === 0) return;

  const iA = nodeIdx.get("A");
  const iB = nodeIdx.get("B");
  const iC = nodeIdx.get("C");

  if (iA != null) {
    nodeA.runtime.state = CodeToNodeState[bufStates[iA]] ?? CodeToNodeState[0];
    nodeA.updateVisualByState();
    nodeA.setDebugText(`Feed in:${bufLiquidIn[iA].toFixed(1)}`);
  }
  if (iB != null) {
    nodeB.runtime.state = CodeToNodeState[bufStates[iB]] ?? CodeToNodeState[0];
    nodeB.updateVisualByState();
    nodeB.setDebugText(
      `Reactor in:${bufLiquidIn[iB].toFixed(1)} gas:${bufGasOut[iB].toFixed(1)}`
    );
  }
  if (iC != null) {
    nodeC.runtime.state = CodeToNodeState[bufStates[iC]] ?? CodeToNodeState[0];
    nodeC.updateVisualByState();
    nodeC.setDebugText(`Sep in:${bufLiquidIn[iC].toFixed(1)}`);
  }

  const eAR = edgeIdx.get("AR");
  const eRB = edgeIdx.get("RB");
  const eRC = edgeIdx.get("RC");

  const norm = (x: number) => Math.max(0, Math.min(1, x / 12));

  if (eAR != null) pipeAR.setFlowLevel(norm(bufEdgeInFlight[eAR]));
  if (eRB != null) {
    pipeRB.setFlowLevel(norm(bufEdgeInFlight[eRB]));
    pipeRB.setActive(bufEdgeActive[eRB] === 1);
  }
  if (eRC != null) {
    pipeRC.setFlowLevel(norm(bufEdgeInFlight[eRC]));
    pipeRC.setActive(bufEdgeActive[eRC] === 1);
  }
}

/* =========================================================
 * Resize + Render loop
 * ======================================================= */

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
function animate(now: number) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  orbit.update();

  pushFeed(dt);
  applySnapshotToVisuals();

  // still animate pipe visuals on main thread
  pipeAR.update(dt);
  pipeRB.update(dt);
  pipeRC.update(dt);

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
