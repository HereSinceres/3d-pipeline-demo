import * as THREE from 'three';
import type { PortSpecV1 } from '../runtime/workerProtocol';
import { Port } from './Port';

/**
 * Router node
 * - 1 input
 * - 2 outputs (true / false)
 */
export class RouterNode extends THREE.Group {
  // ports
  private ports: Port[] = [];
  private portMap = new Map<string, Port>();
  public inputs: PortSpecV1[] = [];
  public outputs: PortSpecV1[] = [];

  // visuals
  private body: THREE.Mesh;
  private labelSprite: THREE.Sprite;

  // router condition (visual hint only; logic in worker)
  public condition = true;

  constructor(id: string = 'Router', ports?: { inputs?: PortSpecV1[]; outputs?: PortSpecV1[] }) {
    super();
    this.userData.id = id;

    /* =============================
     * Body (diamond)
     * =========================== */

    const geo = new THREE.OctahedronGeometry(0.9);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.15,
    });

    this.body = new THREE.Mesh(geo, mat);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.add(this.body);

    this.buildPorts(id, ports);

    /* =============================
     * Label
     * =========================== */

    this.labelSprite = this.createTextSprite(id);
    this.labelSprite.position.set(0, 1.2, 0);
    this.add(this.labelSprite);
  }

  /* =========================================================
   * Public API
   * ======================================================= */

  getDraggable(): THREE.Object3D {
    return this;
  }

  setLabelText(text: string) {
    this.updateSpriteText(this.labelSprite, text);
  }

  /** 根据 condition 返回当前使用的输出端口 */
  route(): THREE.Object3D {
    const outTrue = this.portMap.get('out-true') ?? this.ports.find((p) => p.userData.portType === 'output');
    const outFalse = this.portMap.get('out-false') ?? outTrue;
    return this.condition ? (outTrue ?? this) : (outFalse ?? this);
  }

  updateVisualByState() {
    // visual hint for routing only
    const outTrue = this.portMap.get('out-true');
    const outFalse = this.portMap.get('out-false');
    if (outTrue) {
      const ring = outTrue.children[0] as THREE.Mesh;
      const mat = ring.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(this.condition ? 0x065f46 : 0x000000);
    }
    if (outFalse) {
      const ring = outFalse.children[0] as THREE.Mesh;
      const mat = ring.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(!this.condition ? 0x7c2d12 : 0x000000);
    }
  }

  getPorts() {
    return this.ports;
  }

  getPortById(id: string) {
    return this.portMap.get(id);
  }

  /* =========================================================
   * Helpers
   * ======================================================= */

  private createTextSprite(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.8, 1.4, 1);
    return sprite;
  }

  private updateSpriteText(sprite: THREE.Sprite, text: string) {
    const tex = sprite.material.map as THREE.CanvasTexture;
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    tex.needsUpdate = true;
  }

  private buildPorts(nodeId: string, spec?: { inputs?: PortSpecV1[]; outputs?: PortSpecV1[] }) {
    const inputs = spec?.inputs?.length
      ? spec.inputs
      : [{ id: 'in', direction: 'in', position: { x: 0.0, y: 0.0, z: -1.2 } }];
    const outputs = spec?.outputs?.length
      ? spec.outputs
      : [
          { id: 'out-true', direction: 'out', position: { x: 1.2, y: 0.0, z: 0.0 } },
          { id: 'out-false', direction: 'out', position: { x: -1.2, y: 0.0, z: 0.0 } },
        ];

    this.inputs = inputs;
    this.outputs = outputs;

    for (const p of [...inputs, ...outputs]) {
      const port = new Port(p.direction);
      port.position.set(p.position.x, p.position.y, p.position.z);
      port.userData = {
        kind: 'port',
        portType: p.direction === 'in' ? 'input' : 'output',
        nodeId,
        portId: p.id,
      };
      this.ports.push(port);
      this.portMap.set(p.id, port);
      this.add(port);
    }
  }
}
