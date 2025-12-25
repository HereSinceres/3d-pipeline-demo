import * as THREE from 'three';

type Hook = () => void;

export class EdgeDrawController {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private dom: HTMLElement;
  private getPorts: () => THREE.Object3D[];
  private onCreateEdge: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => void;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private active = false;
  private fromPort: THREE.Object3D | null = null;

  private tempLine: THREE.Line | null = null;

  private onBeginHooks: Hook[] = [];
  private onEndHooks: Hook[] = [];
  private onCancelHooks: Hook[] = [];

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    dom: HTMLElement,
    getPorts: () => THREE.Object3D[],
    onCreateEdge: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => void
  ) {
    this.scene = scene;
    this.camera = camera;
    this.dom = dom;
    this.getPorts = getPorts;
    this.onCreateEdge = onCreateEdge;

    dom.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    dom.addEventListener('pointermove', this.onPointerMove, { passive: false });
    dom.addEventListener('pointerup', this.onPointerUp, { passive: false });
    dom.addEventListener('pointerleave', this.onPointerCancel, { passive: false });
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('pointerleave', this.onPointerCancel);
    this.cleanupTemp();
  }

  isActive() {
    return this.active;
  }

  onBegin(fn: Hook) { this.onBeginHooks.push(fn); }
  onEnd(fn: Hook) { this.onEndHooks.push(fn); }
  onCancel(fn: Hook) { this.onCancelHooks.push(fn); }

  private onPointerDown = (e: PointerEvent) => {
    if (!e.shiftKey) return;

    const port = this.pickPort(e);
    if (!port) return;

    // 只允许从 output 开始（强 gating）
    if (port.userData?.portType !== 'output') return;

    e.preventDefault();
    e.stopPropagation();
    this.begin(port);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.active || !this.fromPort) return;

    e.preventDefault();
    e.stopPropagation();

    const p = this.getWorldPointOnPlane(e, 0.6);
    this.updateTempLine(this.fromPort.getWorldPosition(new THREE.Vector3()), p);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.active) return;

    e.preventDefault();
    e.stopPropagation();

    const toPort = this.pickPort(e);

    // 必须落在 input port
    if (!toPort || toPort.userData?.portType !== 'input') {
      this.cancel();
      return;
    }

    if (toPort === this.fromPort) {
      this.cancel();
      return;
    }

    const fromNodeId = this.fromPort?.userData?.nodeId;
    const toNodeId = toPort.userData?.nodeId;
    const fromPortId = this.fromPort?.userData?.portId;
    const toPortId = toPort.userData?.portId;
    if (fromNodeId && toNodeId && fromPortId && toPortId) {
      this.onCreateEdge(fromNodeId, fromPortId, toNodeId, toPortId);
      this.end();
    } else {
      this.cancel();
    }
  };

  private onPointerCancel = (_e: PointerEvent) => {
    if (!this.active) return;
    this.cancel();
  };

  private begin(port: THREE.Object3D) {
    this.active = true;
    this.fromPort = port;

    const a = port.getWorldPosition(new THREE.Vector3());
    this.createTempLine(a, a);

    this.onBeginHooks.forEach(fn => fn());
  }

  private end() {
    this.cleanupTemp();
    this.fromPort = null;
    this.active = false;
    this.onEndHooks.forEach(fn => fn());
  }

  private cancel() {
    this.cleanupTemp();
    this.fromPort = null;
    this.active = false;
    this.onCancelHooks.forEach(fn => fn());
  }

  private pickPort(e: PointerEvent): THREE.Object3D | null {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const ports = this.getPorts();
    const hits = this.raycaster.intersectObjects(ports, true);

    // 允许点击到子 mesh：往上爬到 kind=port
    if (hits.length === 0) return null;

    let o: THREE.Object3D | null = hits[0].object;
    while (o && o.userData?.kind !== 'port') o = o.parent;
    return o;
  }

  private getWorldPointOnPlane(e: PointerEvent, planeY: number): THREE.Vector3 {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const hit = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, hit);

    if (!Number.isFinite(hit.x)) return new THREE.Vector3(0, planeY, 0);
    return hit;
  }

  private createTempLine(a: THREE.Vector3, b: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineDashedMaterial({
      color: 0x60a5fa,
      dashSize: 0.4,
      gapSize: 0.2,
    });

    this.tempLine = new THREE.Line(geo, mat);
    this.tempLine.computeLineDistances();
    this.scene.add(this.tempLine);
  }

  private updateTempLine(a: THREE.Vector3, b: THREE.Vector3) {
    if (!this.tempLine) return;
    const geo = this.tempLine.geometry as THREE.BufferGeometry;
    geo.setFromPoints([a, b]);
    geo.attributes.position.needsUpdate = true;
    this.tempLine.computeLineDistances();
  }

  private cleanupTemp() {
    if (!this.tempLine) return;
    this.scene.remove(this.tempLine);
    this.tempLine.geometry.dispose();
    (this.tempLine.material as THREE.Material).dispose();
    this.tempLine = null;
  }
}
