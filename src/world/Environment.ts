import * as THREE from 'three';
import { CONFIG } from '../config';
import { Rng } from '../core/Rng';
import { box, merge, paint } from '../entities/CarBuilder';
interface Scenery { mesh: THREE.InstancedMesh; positions: Float32Array; initial: Float32Array; scales: Float32Array; }
export class Environment {
  private readonly batches: Scenery[] = [];
  private readonly transform = new THREE.Object3D();
  constructor(scene: THREE.Scene, seed: number) {
    const w = CONFIG.world, c = CONFIG.colors;
    scene.fog = new THREE.Fog(c.fog, w.fogNear, w.fogFar);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(w.skyRadius, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { topColor: { value: new THREE.Color(c.skyTop) }, bottomColor: { value: new THREE.Color(c.skyBottom) } },
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPosition; void main(){float h=smoothstep(-0.04,0.65,normalize(vPosition).y);gl_FragColor=vec4(mix(bottomColor,topColor,h),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    })); scene.add(sky);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(w.sunRadius, 48), new THREE.MeshBasicMaterial({ color: c.sun, fog: false }));
    sun.position.set(-65, 47, -210); scene.add(sun);
    scene.add(new THREE.HemisphereLight(c.skyBottom, c.tree, w.hemiIntensity));
    const light = new THREE.DirectionalLight(c.headlight, w.sunIntensity);
    light.position.set(-22, 35, -18); light.castShadow = true;
    light.shadow.mapSize.set(w.shadowSize, w.shadowSize);
    Object.assign(light.shadow.camera, { left: -w.shadowExtent, right: w.shadowExtent, top: w.shadowExtent, bottom: -w.shadowExtent, far: w.shadowFar });
    light.shadow.normalBias = 0.04; scene.add(light);
    const rng = new Rng(seed + w.scenerySeedOffset);
    const treePositions = new Float32Array(w.sceneryCount * 3), treeScales = new Float32Array(w.sceneryCount);
    for (let i = 0; i < w.sceneryCount; i++) {
      treePositions[i * 3] = (i % 2 ? 1 : -1) * rng.range(w.treeMinX, w.treeMaxX);
      treePositions[i * 3 + 2] = -rng.range(0, w.sceneryLength);
      treeScales[i] = rng.range(w.treeMinHeight, w.treeMaxHeight);
    }
    this.addBatch(scene, new THREE.ConeGeometry(w.treeRadius / 3, 0.75, 5).translate(0, 0.65, 0), c.tree, treePositions, treeScales);
    this.addBatch(scene, new THREE.ConeGeometry(w.treeRadius / 4, 0.6, 5).translate(0, 1.02, 0), c.treeLight, treePositions, treeScales);
    this.addBatch(scene, new THREE.CylinderGeometry(0.055, 0.075, 0.48, 5).translate(0, 0.24, 0), c.trunk, treePositions, treeScales);
    const lampPositions = new Float32Array(w.lampCount * 3), lampScales = new Float32Array(w.lampCount).fill(1);
    for (let i = 0; i < w.lampCount; i++) { lampPositions[i * 3] = (i % 2 ? 1 : -1) * w.lampX; lampPositions[i * 3 + 2] = -Math.floor(i / 2) * w.lampSpacing; }
    const lamp = merge([box(0.12, w.lampHeight, 0.12, 0, w.lampHeight / 2), box(1.7, 0.1, 0.12, 0, w.lampHeight), box(0.7, 0.08, 0.38, 0, w.lampHeight - 0.08)]);
    this.addBatch(scene, lamp, c.chrome, lampPositions, lampScales);
    const buildingPositions = new Float32Array(w.buildingCount * 3), buildingScales = new Float32Array(w.buildingCount);
    for (let i = 0; i < w.buildingCount; i++) { buildingPositions[i * 3] = (i % 2 ? 1 : -1) * rng.range(w.buildingMinX, w.buildingMaxX); buildingPositions[i * 3 + 2] = -rng.range(0, w.sceneryLength); buildingScales[i] = rng.range(3, 7); }
    this.addBatch(scene, box(1.2, 1.8, 1, 0, 0.9), c.building, buildingPositions, buildingScales);
    // Distant silhouettes sit beyond the moving scenery, like a skybox.
    for (let i = 0; i < w.mountainCount; i++) {
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(rng.range(w.mountainRadius * 0.7, w.mountainRadius * 1.5), rng.range(w.mountainHeight * 0.5, w.mountainHeight * 1.5), 5), new THREE.MeshLambertMaterial({ color: i % 2 ? c.mountain : c.distantMountain, fog: false }));
      mountain.position.set((i - w.mountainCount / 2) * 26, 4, -w.mountainDistance - rng.range(0, 25)); mountain.rotation.y = rng.range(0, Math.PI); scene.add(mountain);
    }
    this.update(0);
  }
  private addBatch(scene: THREE.Scene, geometry: THREE.BufferGeometry, color: string, positions: Float32Array, scales: Float32Array): void {
    const batch = new THREE.InstancedMesh(geometry, paint(color), scales.length);
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); batch.frustumCulled = false; batch.castShadow = true;
    scene.add(batch); this.batches.push({ mesh: batch, positions: positions.slice(), initial: positions, scales });
  }
  update(distance: number): void {
    for (const batch of this.batches) {
      for (let i = 0; i < batch.scales.length; i++) {
        const offset = i * 3; batch.positions[offset + 2] += distance;
        if (batch.positions[offset + 2] > CONFIG.spawn.recycleZ) batch.positions[offset + 2] -= CONFIG.world.sceneryLength;
        this.transform.position.set(batch.positions[offset], batch.positions[offset + 1], batch.positions[offset + 2]);
        this.transform.scale.setScalar(batch.scales[i]); this.transform.updateMatrix(); batch.mesh.setMatrixAt(i, this.transform.matrix);
      }
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  reset(): void { for (const batch of this.batches) batch.positions.set(batch.initial); this.update(0); }
}
