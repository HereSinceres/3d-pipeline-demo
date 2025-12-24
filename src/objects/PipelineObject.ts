import * as THREE from 'three';
import { SubstanceType, SubstanceColor } from '../core/Substance';

type PositionLike = THREE.Object3D | THREE.Vector3;

function resolveWorldPosition(src: PositionLike, out: THREE.Vector3) {
  if (src instanceof THREE.Object3D) src.getWorldPosition(out);
  else if (src instanceof THREE.Vector3) out.copy(src);
}

export class PipelineObject extends THREE.Object3D {
  private from: PositionLike;
  private to: PositionLike;

  private tubeMesh: THREE.Mesh;
  private tubeMat: THREE.MeshStandardMaterial;

  private curve: THREE.CatmullRomCurve3;
  private tubeGeo: THREE.TubeGeometry;

  private markers: THREE.Mesh[] = [];
  private t0 = Math.random();

  private active = true;
  private flowLevel = 1; // 0..1

  constructor(from: PositionLike, to: PositionLike, substance: SubstanceType) {
    super();

    this.from = from;
    this.to = to;

    this.curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);

    this.tubeGeo = new THREE.TubeGeometry(this.curve, 48, 0.26, 14, false);

    this.tubeMat = new THREE.MeshStandardMaterial({
      color: SubstanceColor[substance],
      emissive: SubstanceColor[substance],
      emissiveIntensity: 0.35,
      roughness: 0.55,
      metalness: 0.05,
      transparent: true,
      opacity: 0.95,
    });

    this.tubeMesh = new THREE.Mesh(this.tubeGeo, this.tubeMat);
    this.add(this.tubeMesh);

    // markers
    const mGeo = new THREE.SphereGeometry(0.16, 16, 16);
    const mMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: SubstanceColor[substance],
      emissiveIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.05,
      transparent: true,
      opacity: 0.95,
    });

    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(mGeo, mMat);
      this.markers.push(m);
      this.add(m);
    }

    this.rebuild();
  }

  setActive(active: boolean) {
    this.active = active;
    this.markers.forEach(m => (m.visible = active));
    // 也可以让管道变淡
    this.tubeMat.opacity = active ? 0.95 : 0.25;
    this.tubeMat.transparent = true;
  }

  setFlowLevel(level01: number) {
    this.flowLevel = Math.max(0, Math.min(1, level01));
  }

  private rebuild() {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    resolveWorldPosition(this.from, a);
    resolveWorldPosition(this.to, b);

    if (a.distanceToSquared(b) < 1e-6) b.x += 0.001;

    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 2.0, 0));
    this.curve = new THREE.CatmullRomCurve3([a, mid, b]);

    this.tubeGeo.dispose();
    this.tubeGeo = new THREE.TubeGeometry(this.curve, 48, 0.26, 14, false);
    this.tubeMesh.geometry = this.tubeGeo;
  }

  update(dt: number) {
    this.rebuild();

    // pulse intensity reflects flow level (0..1)
    const base = 0.18 + this.flowLevel * 0.35;
    this.tubeMat.emissiveIntensity = base + Math.sin((this.t0 += dt) * 4.0) * 0.08;

    if (!this.active) return;

    // marker speed reflects flow level
    const speed = 0.12 + this.flowLevel * 0.35;

    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.markers.length; i++) {
      const t = (this.t0 * speed + i / this.markers.length) % 1;
      this.curve.getPointAt(t, tmp);
      this.markers[i].position.copy(tmp);
    }
  }
}
