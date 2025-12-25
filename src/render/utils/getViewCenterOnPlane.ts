import * as THREE from 'three';

/**
 * 取视野中心（NDC 0,0）的射线与水平平面 y=planeY 的交点
 * 用于“新增节点落在视野中心”的工业级体验
 */
export function getViewCenterOnPlane(
  camera: THREE.Camera,
  planeY = 0.6
): THREE.Vector3 {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);

  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, hit);

  // 如果相机与平面平行导致无交点，兜底返回 (0, planeY, 0)
  if (!Number.isFinite(hit.x) || !Number.isFinite(hit.y) || !Number.isFinite(hit.z)) {
    return new THREE.Vector3(0, planeY, 0);
  }

  return hit;
}
