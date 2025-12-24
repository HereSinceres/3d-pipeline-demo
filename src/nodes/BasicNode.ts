import * as THREE from 'three';
import { Port } from './Port';
import { NodeRuntime } from '../runtime/NodeRuntime';
import { NodeState } from '../runtime/NodeState';

export class BasicNode extends THREE.Object3D {
  readonly body: THREE.Mesh;
  readonly input: Port;
  readonly output: Port;

  readonly runtime = new NodeRuntime();

  private labelSprite: THREE.Sprite;
  private labelText = '';

  constructor(label: string, color = 0x64748b) {
    super();

    const geo = new THREE.BoxGeometry(2.2, 1.2, 2.2);
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.25,
      roughness: 0.65,
      emissive: 0x000000,
      emissiveIntensity: 0.8,
    });

    this.body = new THREE.Mesh(geo, mat);
    this.add(this.body);

    this.input = new Port('in');
    this.input.position.set(-1.4, 0, 0);
    this.body.add(this.input);

    this.output = new Port('out');
    this.output.position.set(1.4, 0, 0);
    this.body.add(this.output);

    this.labelSprite = makeTextSprite(label);
    this.labelSprite.position.set(0, 1.4, 0);
    this.add(this.labelSprite);
  }

  updateVisualByState() {
    const mat = this.body.material as THREE.MeshStandardMaterial;

    switch (this.runtime.state) {
      case NodeState.IDLE:
        mat.color.setHex(0x64748b);
        mat.emissive.setHex(0x000000);
        break;
      case NodeState.RUNNING:
        mat.color.setHex(0x475569);
        mat.emissive.setHex(0x22c55e);
        break;
      case NodeState.BLOCKED:
        mat.color.setHex(0x7f1d1d);
        mat.emissive.setHex(0xef4444);
        break;
    }
  }

  /** 显示 buffer 数值（可选但强烈建议） */
  setDebugText(text: string) {
    if (text === this.labelText) return;
    this.labelText = text;

    // recreate sprite texture
    const oldMat = this.labelSprite.material as THREE.SpriteMaterial;
    const oldMap = oldMat.map;
    if (oldMap) oldMap.dispose();
    oldMat.dispose();

    this.remove(this.labelSprite);
    this.labelSprite = makeTextSprite(text);
    this.labelSprite.position.set(0, 1.4, 0);
    this.add(this.labelSprite);
  }

  getDraggable(): THREE.Object3D {
    return this.body;
  }
}

/* ---------- helpers ---------- */

function makeTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Sprite(new THREE.SpriteMaterial({ opacity: 0 }));

  const padding = 10;
  ctx.font = '600 16px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width) + padding * 2;
  const h = 40;

  canvas.width = w;
  canvas.height = h;

  const c = canvas.getContext('2d')!;
  c.font = '600 16px system-ui, -apple-system, Segoe UI, Roboto, Arial';

  c.fillStyle = 'rgba(15,23,42,0.72)';
  roundRect(c, 0, 0, w, h, 10);
  c.fill();

  c.strokeStyle = 'rgba(255,255,255,0.16)';
  c.lineWidth = 2;
  roundRect(c, 1, 1, w - 2, h - 2, 9);
  c.stroke();

  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.textBaseline = 'middle';
  c.fillText(text, padding, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;

  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);

  const scale = 0.02;
  sprite.scale.set(w * scale, h * scale, 1);

  return sprite;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
