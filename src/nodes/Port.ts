import * as THREE from 'three';

export type PortDirection = 'in' | 'out';

export class Port extends THREE.Object3D {
  direction: PortDirection;

  constructor(direction: PortDirection) {
    super();
    this.direction = direction;

    const baseColor = direction === 'in' ? 0x38bdf8 : 0x22c55e;
    const emissive = direction === 'in' ? 0x0ea5e9 : 0x16a34a;

    const ringGeo = new THREE.TorusGeometry(0.18, 0.045, 14, 24);
    const ringMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive,
      emissiveIntensity: 0.6,
      roughness: 0.35,
      metalness: 0.2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    this.add(ring);

    const discGeo = new THREE.CircleGeometry(0.14, 18);
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x0f172a,
      emissiveIntensity: 0.25,
      roughness: 0.8,
      metalness: 0.0,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    this.add(disc);

    const tipGeo = new THREE.ConeGeometry(0.06, 0.16, 12);
    const tipMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.1,
    });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.y = 0.12;
    tip.rotation.x = Math.PI;
    this.add(tip);
  }
}
