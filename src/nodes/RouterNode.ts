import * as THREE from "three";
import { Port } from "./Port";

export class RouterNode extends THREE.Object3D {
  readonly body: THREE.Mesh;
  readonly input: Port;
  readonly outTrue: Port;
  readonly outFalse: Port;

  // demo condition: toggle externally
  condition = true;

  constructor() {
    super();

    const geo = new THREE.OctahedronGeometry(1.0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      metalness: 0.25,
      roughness: 0.55,
      emissive: 0x2a0a00,
      emissiveIntensity: 0.25,
    });

    this.body = new THREE.Mesh(geo, mat);
    this.add(this.body);

    this.input = new Port("in");
    this.input.position.set(0, 0, 1.4);
    this.body.add(this.input);

    this.outTrue = new Port("out");
    this.outTrue.position.set(1.6, 0, 0);
    this.body.add(this.outTrue);

    this.outFalse = new Port("out");
    this.outFalse.position.set(-1.6, 0, 0);
    this.body.add(this.outFalse);
  }

  // returns the active output port
  route(): Port {
    return this.condition ? this.outTrue : this.outFalse;
  }
  getDraggable(): THREE.Object3D {
    return this.body;
  }
}
