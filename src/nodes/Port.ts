import * as THREE from 'three';

export type PortDirection = 'in' | 'out';

export class Port extends THREE.Object3D {
  direction: PortDirection;

  constructor(direction: PortDirection) {
    super();
    this.direction = direction;

    const geo = new THREE.SphereGeometry(0.18, 18, 18);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x111827,
      emissiveIntensity: 0.2,
      roughness: 0.6,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.add(mesh);
  }
}
