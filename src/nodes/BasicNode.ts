import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { PortSpecV1 } from "../runtime/workerProtocol";
import { Port } from "./Port";

/**
 * Basic processing node
 * - 1 input
 * - 1 output
 */
export class BasicNode extends THREE.Group {
  private static modelPromise: Promise<{
    scene: THREE.Object3D;
    animations: THREE.AnimationClip[];
  }> | null = null;

  // ports
  private ports: Port[] = [];
  private portMap = new Map<string, Port>();
  public inputs: PortSpecV1[] = [];
  public outputs: PortSpecV1[] = [];

  // visuals
  private body: THREE.Mesh;
  private modelGroup: THREE.Group;
  private modelUrl?: string;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private activeClip: string | null = null;
  private visualState: "normal" | "warn" | "alert" = "normal";
  private running = true;
  private labelSprite: THREE.Sprite;
  private debugSprite: THREE.Sprite;

  constructor(
    id: string,
    modelUrl?: string,
    ports?: { inputs?: PortSpecV1[]; outputs?: PortSpecV1[] }
  ) {
    super();
    this.userData.id = id;
    this.modelUrl = modelUrl;

    /* =============================
     * Body
     * =========================== */

    const bodyGeo = new THREE.BoxGeometry(2.2, 1.2, 1.6);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.6,
      metalness: 0.1,
    });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.add(this.body);

    this.modelGroup = new THREE.Group();
    this.add(this.modelGroup);
    this.loadModel();

    this.buildPorts(id, ports);

    /* =============================
     * Label
     * =========================== */

    this.labelSprite = this.createTextSprite(id, 0xffffff);
    this.labelSprite.position.set(0, 0.9, 0);
    this.add(this.labelSprite);

    /* =============================
     * Debug text
     * =========================== */

    this.debugSprite = this.createTextSprite("", 0x94a3b8);
    this.debugSprite.position.set(0, -0.9, 0);
    this.add(this.debugSprite);
  }

  /* =========================================================
   * Public API
   * ======================================================= */

  /** 用于 TransformControls */
  getDraggable(): THREE.Object3D {
    return this;
  }

  getPorts() {
    return this.ports;
  }

  getPortById(id: string) {
    return this.portMap.get(id);
  }

  /** 设置显示名称（label） */
  setLabelText(text: string) {
    this.updateSpriteText(this.labelSprite, text, 0xffffff);
  }

  /** 设置调试文本（如 in/out 数量） */
  setDebugText(text: string) {
    this.updateSpriteText(this.debugSprite, text, 0x94a3b8);
  }

  setVisualState(state: "normal" | "warn" | "alert") {
    this.visualState = state;
    const applyToMesh = (mesh: THREE.Mesh) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat || !mat.isMeshStandardMaterial) return;

      if (!mesh.userData) mesh.userData = {};
      let base = mesh.userData.baseMat as
        | {
            color: THREE.Color;
            emissive: THREE.Color;
            emissiveIntensity: number;
            roughness: number;
            metalness: number;
          }
        | undefined;
      if (!base) {
        base = {
          color: mat.color.clone(),
          emissive: mat.emissive.clone(),
          emissiveIntensity: mat.emissiveIntensity,
          roughness: mat.roughness,
          metalness: mat.metalness,
        };
        mesh.userData.baseMat = base;
      }

      if (state === "normal") {
        mat.color.copy(base.color);
        mat.emissive.copy(base.emissive);
        mat.emissiveIntensity = base.emissiveIntensity;
        mat.roughness = base.roughness;
        mat.metalness = base.metalness;
        return;
      }

      if (state === "warn") {
        mat.color.setHex(0xf59e0b);
        mat.emissive.setHex(0x92400e);
        mat.emissiveIntensity = 0.35;
        mat.roughness = 0.5;
        return;
      }

      mat.color.setHex(0xff0000);
      mat.emissive.setHex(0xff0000);
      mat.emissiveIntensity = 0.4;
      mat.roughness = 0.45;
    };

    this.modelGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) applyToMesh(mesh);
    });

    applyToMesh(this.body);
  }

  setRunning(running: boolean) {
    this.running = running;
  }

  setAnimationByName(name: string | null) {
    if (!this.mixer) return;
    if (this.activeClip === name) return;

    const next = name ? this.actions.get(name) : null;
    if (!next) {
      this.actions.forEach((a) => a.stop());
      this.activeClip = null;
      return;
    }

    this.actions.forEach((a) => {
      if (a !== next) a.stop();
    });
    next.reset().play();
    this.activeClip = name;
  }

  update(dt: number) {
    if (this.mixer && this.running) this.mixer.update(dt);
  }

  /* =========================================================
   * Helpers
   * ======================================================= */

  private createTextSprite(text: string, color: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = "28px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
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

  private updateSpriteText(sprite: THREE.Sprite, text: string, color: number) {
    const tex = sprite.material.map as THREE.CanvasTexture;
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "28px sans-serif";
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    tex.needsUpdate = true;
  }

  private buildPorts(
    nodeId: string,
    spec?: { inputs?: PortSpecV1[]; outputs?: PortSpecV1[] }
  ) {
    const inputs = spec?.inputs?.length
      ? spec.inputs
      : [{ id: "in", direction: "in", position: { x: -1.3, y: 0.0, z: 0.0 } }];
    const outputs = spec?.outputs?.length
      ? spec.outputs
      : [{ id: "out", direction: "out", position: { x: 1.3, y: 0.0, z: 0.0 } }];

    this.inputs = inputs;
    this.outputs = outputs;

    for (const p of [...inputs, ...outputs]) {
      const port = new Port(p.direction);
      port.position.set(p.position.x, p.position.y, p.position.z);
      port.userData = {
        kind: "port",
        portType: p.direction === "in" ? "input" : "output",
        nodeId,
        portId: p.id,
      };
      this.ports.push(port);
      this.portMap.set(p.id, port);
      this.add(port);
    }
  }

  private loadModel() {
    const url = this.modelUrl ?? "/models/engine.glb";

    if (!BasicNode.modelPromise || (BasicNode as any).modelUrl !== url) {
      const loader = new GLTFLoader();
      BasicNode.modelPromise = new Promise((resolve, reject) => {
        loader.load(
          url,
          (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }),
          undefined,
          (err) => reject(err)
        );
      });
      (BasicNode as any).modelUrl = url;
    }

    BasicNode.modelPromise
      .then(({ scene, animations }) => {
        const instance = scene.clone(true);
        instance.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        const box = new THREE.Box3().setFromObject(instance);
        const size = new THREE.Vector3();
        box.getSize(size);
        const max = Math.max(size.x, size.y, size.z);
        const scale = max > 0 ? 2.2 / max : 1;
        instance.scale.setScalar(scale);

        const box2 = new THREE.Box3().setFromObject(instance);
        const center = new THREE.Vector3();
        box2.getCenter(center);
        instance.position.sub(center);

        const box3 = new THREE.Box3().setFromObject(instance);
        instance.position.y += -0.6 - box3.min.y;

        this.modelGroup.clear();
        this.modelGroup.add(instance);
        this.body.visible = false;

        if (animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(instance);
          this.actions.clear();
          animations.forEach((clip) => {
            const action = this.mixer!.clipAction(clip);
            this.actions.set(clip.name, action);
          });
        }

        this.setVisualState(this.visualState);
        if (this.activeClip) this.setAnimationByName(this.activeClip);
      })
      .catch((err) => {
        console.warn("Failed to load engine model", err);
        this.body.visible = true;
      });
  }
}
