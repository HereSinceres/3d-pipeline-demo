/// <reference lib="webworker" />

import type { FlowGraphV1, SimMsg, SimOutMsg } from "../runtime/workerProtocol";
import { NodeState } from "../runtime/NodeState";
import { NodeStateToCode } from "../runtime/workerProtocol";

/* =========================================================
 * Constants / Helpers
 * ======================================================= */

// 固定 4 种物质：solid/liquid/gas/data
const SOLID = 0,
  LIQUID = 1,
  GAS = 2,
  DATA = 3;
const SUBSTANCE_DIM = 4;

// 每条边 ring buffer 容量（可按需要调大）
const RING_CAPACITY = 64;

// 数值稳定阈值
const EPS = 1e-6;

function sum4(buf: Float32Array, off = 0): number {
  return buf[off] + buf[off + 1] + buf[off + 2] + buf[off + 3];
}

/* =========================================================
 * Graph compiled storage
 * ======================================================= */

let graph: FlowGraphV1 | null = null;

// index mapping
let nodeIds: string[] = [];
let edgeIds: string[] = [];
let nodeIndex = new Map<string, number>();
let edgeIndex = new Map<string, number>();

// node arrays
let nodeIsRouter!: Uint8Array;
let nodeState!: Int8Array;

let inCap!: Float32Array;
let outCap!: Float32Array;
let rate!: Float32Array;
let startTh!: Float32Array;

// substance bags: SoA
let inBag!: Float32Array; // size = N * 4
let outBag!: Float32Array; // size = N * 4

// yield matrix per node (flatten 4x4), or null
let yieldM!: (Float32Array | null)[];

// edge arrays
let eFrom!: Int32Array;
let eTo!: Int32Array;
let eCap!: Float32Array;
let eDelay!: Float32Array;
let eActive!: Int8Array;

// router
let routerCond!: Uint8Array; // per node
let routerOutEdges!: number[][]; // per node: edge indices

/* =========================================================
 * inFlight RingBuffer (per edge)
 * ======================================================= */

// For each edge:
// - bagRing: Float32Array [RING_CAPACITY * 4]
// - etaRing: Float32Array [RING_CAPACITY]
// - head, tail, size

let bagRing!: Float32Array[];
let etaRing!: Float32Array[];
let ringHead!: Int32Array;
let ringTail!: Int32Array;
let ringSize!: Int32Array;

/* =========================================================
 * Scheduling
 * ======================================================= */

let running = true;
let tickHz = 120;
let publishHz = 20;
let publishIds = false;
let simTime = 0;

let tickTimer: number | null = null;
let publishTimer: number | null = null;

/* =========================================================
 * Lifecycle
 * ======================================================= */

function stopLoops() {
  if (tickTimer) clearInterval(tickTimer);
  if (publishTimer) clearInterval(publishTimer);
  tickTimer = publishTimer = null;
}

function startLoops() {
  stopLoops();
  const tickMs = Math.max(1, Math.floor(1000 / tickHz));
  const pubMs = Math.max(1, Math.floor(1000 / publishHz));

  tickTimer = setInterval(() => {
    if (!running || !graph) return;
    const dt = 1 / tickHz;
    tick(dt);
    simTime += dt;
  }, tickMs);

  publishTimer = setInterval(() => {
    if (!graph) return;
    postBinarySnapshot();
  }, pubMs);
}

/* =========================================================
 * Compile Graph
 * ======================================================= */

function compileGraph(g: FlowGraphV1) {
  graph = g;
  simTime = 0;

  nodeIds = g.nodes.map((n) => n.id);
  edgeIds = g.edges.map((e) => e.id);

  nodeIndex = new Map(nodeIds.map((id, i) => [id, i]));
  edgeIndex = new Map(edgeIds.map((id, i) => [id, i]));

  const N = nodeIds.length;
  const E = edgeIds.length;

  nodeIsRouter = new Uint8Array(N);
  nodeState = new Int8Array(N);

  inCap = new Float32Array(N);
  outCap = new Float32Array(N);
  rate = new Float32Array(N);
  startTh = new Float32Array(N);

  inBag = new Float32Array(N * SUBSTANCE_DIM);
  outBag = new Float32Array(N * SUBSTANCE_DIM);

  yieldM = new Array(N).fill(null);

  routerCond = new Uint8Array(N);
  routerOutEdges = Array.from({ length: N }, () => []);

  // init nodes
  for (let i = 0; i < N; i++) nodeState[i] = NodeStateToCode[NodeState.IDLE];

  for (const n of g.nodes) {
    const i = nodeIndex.get(n.id)!;
    const isRouter = n.type === "router";
    nodeIsRouter[i] = isRouter ? 1 : 0;

    if (isRouter) {
      inCap[i] = outCap[i] = rate[i] = 1e9;
      startTh[i] = 0;
    } else {
      const rt = n.runtime!;
      inCap[i] = rt.inCapacity;
      outCap[i] = rt.outCapacity;
      rate[i] = rt.processRatePerSec;
      startTh[i] = rt.startThreshold;

      if (rt.process?.yield) {
        const m = new Float32Array(16);
        for (const inType in rt.process.yield) {
          const iIdx =
            inType === "solid"
              ? SOLID
              : inType === "liquid"
              ? LIQUID
              : inType === "gas"
              ? GAS
              : DATA;
          for (const outType in rt.process.yield[inType]) {
            const oIdx =
              outType === "solid"
                ? SOLID
                : outType === "liquid"
                ? LIQUID
                : outType === "gas"
                ? GAS
                : DATA;
            m[iIdx * 4 + oIdx] = rt.process.yield[inType][outType];
          }
        }
        yieldM[i] = m;
      }
    }
  }

  // router condition
  g.routers?.forEach((r) => {
    const i = nodeIndex.get(r.id);
    if (i != null) routerCond[i] = r.condition ? 1 : 0;
  });

  // edges
  eFrom = new Int32Array(E);
  eTo = new Int32Array(E);
  eCap = new Float32Array(E);
  eDelay = new Float32Array(E);
  eActive = new Int8Array(E);

  bagRing = new Array(E);
  etaRing = new Array(E);
  ringHead = new Int32Array(E);
  ringTail = new Int32Array(E);
  ringSize = new Int32Array(E);

  for (let ei = 0; ei < E; ei++) {
    const e = g.edges[ei];
    eFrom[ei] = nodeIndex.get(e.from)!;
    eTo[ei] = nodeIndex.get(e.to)!;
    eCap[ei] = e.capacityPerSec;
    eDelay[ei] = e.delaySec;
    eActive[ei] = 1;

    bagRing[ei] = new Float32Array(RING_CAPACITY * SUBSTANCE_DIM);
    etaRing[ei] = new Float32Array(RING_CAPACITY);
    ringHead[ei] = ringTail[ei] = ringSize[ei] = 0;

    if (nodeIsRouter[eFrom[ei]]) {
      routerOutEdges[eFrom[ei]].push(ei);
    }
  }
}

/* =========================================================
 * Strict Gating
 * ======================================================= */

function recomputeEdgeActiveStrict() {
  eActive.fill(1);

  for (let ni = 0; ni < nodeIds.length; ni++) {
    if (!nodeIsRouter[ni]) continue;
    const outs = routerOutEdges[ni];
    if (outs.length < 2) continue;

    const active = outs[routerCond[ni] ? 0 : 1];
    for (const ei of outs) {
      eActive[ei] = ei === active ? 1 : 0;
    }
  }
}

/* =========================================================
 * Simulation Steps
 * ======================================================= */

function deliver(dt: number) {
  for (let ei = 0; ei < edgeIds.length; ei++) {
    let sz = ringSize[ei];
    if (sz === 0) continue;

    const head = ringHead[ei];
    let idx = head;
    const to = eTo[ei];
    const toOff = to * SUBSTANCE_DIM;

    while (sz > 0) {
      etaRing[ei][idx] -= dt;
      if (etaRing[ei][idx] > 0) break;

      const bag = bagRing[ei];
      const off = idx * SUBSTANCE_DIM;
      inBag[toOff] += bag[off];
      inBag[toOff + 1] += bag[off + 1];
      inBag[toOff + 2] += bag[off + 2];
      inBag[toOff + 3] += bag[off + 3];

      idx = (idx + 1) % RING_CAPACITY;
      sz--;
      ringHead[ei] = idx;
      ringSize[ei] = sz;
    }
  }
}

function process(dt: number) {
  for (let ni = 0; ni < nodeIds.length; ni++) {
    const off = ni * SUBSTANCE_DIM;
    const inTotal = sum4(inBag, off);

    if (inTotal < startTh[ni]) {
      nodeState[ni] = NodeStateToCode[NodeState.IDLE];
      continue;
    }

    const outTotal = sum4(outBag, off);
    if (outTotal >= outCap[ni] - EPS) {
      nodeState[ni] = NodeStateToCode[NodeState.BLOCKED];
      continue;
    }

    nodeState[ni] = NodeStateToCode[NodeState.RUNNING];

    const max = rate[ni] * dt;
    const take = Math.min(max, inTotal);
    if (take <= EPS) continue;

    const ratio = take / inTotal;

    const t0 = inBag[off] * ratio;
    const t1 = inBag[off + 1] * ratio;
    const t2 = inBag[off + 2] * ratio;
    const t3 = inBag[off + 3] * ratio;

    inBag[off] -= t0;
    inBag[off + 1] -= t1;
    inBag[off + 2] -= t2;
    inBag[off + 3] -= t3;

    const y = yieldM[ni];
    if (!y) {
      outBag[off] += t0;
      outBag[off + 1] += t1;
      outBag[off + 2] += t2;
      outBag[off + 3] += t3;
    } else {
      outBag[off] += t0 * y[0] + t1 * y[4] + t2 * y[8] + t3 * y[12];
      outBag[off + 1] += t0 * y[1] + t1 * y[5] + t2 * y[9] + t3 * y[13];
      outBag[off + 2] += t0 * y[2] + t1 * y[6] + t2 * y[10] + t3 * y[14];
      outBag[off + 3] += t0 * y[3] + t1 * y[7] + t2 * y[11] + t3 * y[15];
    }
  }
}

function send(dt: number) {
  for (let ei = 0; ei < edgeIds.length; ei++) {
    if (!eActive[ei]) continue;

    const from = eFrom[ei];
    const to = eTo[ei];
    const fromOff = from * SUBSTANCE_DIM;
    const toOff = to * SUBSTANCE_DIM;

    const outTotal = sum4(outBag, fromOff);
    if (outTotal <= EPS) continue;

    const space = Math.max(0, inCap[to] - sum4(inBag, toOff));
    if (space <= EPS) continue;

    const sendAmt = Math.min(eCap[ei] * dt, outTotal, space);
    if (sendAmt <= EPS) continue;

    if (ringSize[ei] >= RING_CAPACITY) continue; // ring full → backpressure

    const ratio = sendAmt / outTotal;
    const s0 = outBag[fromOff] * ratio;
    const s1 = outBag[fromOff + 1] * ratio;
    const s2 = outBag[fromOff + 2] * ratio;
    const s3 = outBag[fromOff + 3] * ratio;

    outBag[fromOff] -= s0;
    outBag[fromOff + 1] -= s1;
    outBag[fromOff + 2] -= s2;
    outBag[fromOff + 3] -= s3;

    const tail = ringTail[ei];
    const bag = bagRing[ei];
    const off = tail * SUBSTANCE_DIM;
    bag[off] = s0;
    bag[off + 1] = s1;
    bag[off + 2] = s2;
    bag[off + 3] = s3;

    etaRing[ei][tail] = eDelay[ei];

    ringTail[ei] = (tail + 1) % RING_CAPACITY;
    ringSize[ei]++;
  }
}

function propagateBlock() {
  for (let ni = 0; ni < nodeIds.length; ni++) {
    const off = ni * SUBSTANCE_DIM;
    if (sum4(inBag, off) >= inCap[ni] * 0.95) {
      nodeState[ni] = NodeStateToCode[NodeState.BLOCKED];
    }
  }
}

function tick(dt: number) {
  recomputeEdgeActiveStrict();
  deliver(dt);
  process(dt);
  send(dt);
  propagateBlock();
}

/* =========================================================
 * Snapshot (binary)
 * ======================================================= */

function postBinarySnapshot() {
  if (!graph) return;

  const N = nodeIds.length;
  const E = edgeIds.length;

  const states = new Int8Array(N);
  const inTotal = new Float32Array(N);
  const outTotal = new Float32Array(N);
  const liquidIn = new Float32Array(N);
  const gasOut = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    const off = i * SUBSTANCE_DIM;
    states[i] = nodeState[i];
    inTotal[i] = sum4(inBag, off);
    outTotal[i] = sum4(outBag, off);
    liquidIn[i] = inBag[off + LIQUID];
    gasOut[i] = outBag[off + GAS];
  }

  const edgeActive = new Int8Array(E);
  const edgeInFlight = new Float32Array(E);

  for (let ei = 0; ei < E; ei++) {
    edgeActive[ei] = eActive[ei];
    let total = 0;
    const bag = bagRing[ei];
    let idx = ringHead[ei];
    let sz = ringSize[ei];
    while (sz-- > 0) {
      const off = idx * SUBSTANCE_DIM;
      total += bag[off] + bag[off + 1] + bag[off + 2] + bag[off + 3];
      idx = (idx + 1) % RING_CAPACITY;
    }
    edgeInFlight[ei] = total;
  }

  const out: SimOutMsg = {
    type: "SIM_SNAPSHOT_BIN",
    time: simTime,
    nodeIds: publishIds ? nodeIds : undefined,
    edgeIds: publishIds ? edgeIds : undefined,
    nodeStates: states.buffer,
    nodeInTotal: inTotal.buffer,
    nodeOutTotal: outTotal.buffer,
    nodeLiquidIn: liquidIn.buffer,
    nodeGasOut: gasOut.buffer,
    edgeActive: edgeActive.buffer,
    edgeInFlight: edgeInFlight.buffer,
  };

  postMessage(out, [
    states.buffer,
    inTotal.buffer,
    outTotal.buffer,
    liquidIn.buffer,
    gasOut.buffer,
    edgeActive.buffer,
    edgeInFlight.buffer,
  ]);
}

/* =========================================================
 * Worker Message Handling
 * ======================================================= */

self.onmessage = (ev: MessageEvent<SimMsg>) => {
  try {
    const msg = ev.data;

    if (msg.type === "SIM_INIT") {
      compileGraph(msg.graph);
      startLoops();
      postMessage({ type: "SIM_READY", nodeIds, edgeIds });
      return;
    }

    if (!graph) return;

    if (msg.type === "SIM_SET_RATE") {
      if (typeof msg.tickHz === "number") tickHz = msg.tickHz;
      if (typeof msg.publishHz === "number") publishHz = msg.publishHz;
      if (typeof msg.publishIds === "boolean") publishIds = msg.publishIds;
      startLoops();
      return;
    }

    if (msg.type === "SIM_SET_ROUTER") {
      const i = nodeIndex.get(msg.id);
      if (i != null) routerCond[i] = msg.condition ? 1 : 0;
      return;
    }

    if (msg.type === "SIM_FEED") {
      const i = nodeIndex.get(msg.nodeId);
      if (i == null) return;
      const off = i * SUBSTANCE_DIM;
      const b: any = msg.bag;
      inBag[off] += b.solid ?? 0;
      inBag[off + 1] += b.liquid ?? 0;
      inBag[off + 2] += b.gas ?? 0;
      inBag[off + 3] += b.data ?? 0;
      return;
    }

    if (msg.type === "SIM_SET_RUNNING") {
      running = msg.running;
      return;
    }
  } catch (e: any) {
    postMessage({ type: "SIM_ERROR", message: String(e?.message ?? e) });
  }
};
