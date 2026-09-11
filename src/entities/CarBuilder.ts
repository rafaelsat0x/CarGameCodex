import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';

export const materials = {
  glass: new THREE.MeshStandardMaterial({ color: CONFIG.colors.glass, roughness: 0.24, metalness: 0.25 }),
  tire: new THREE.MeshStandardMaterial({ color: CONFIG.colors.tire, roughness: 0.95 }),
  chrome: new THREE.MeshStandardMaterial({ color: CONFIG.colors.chrome, metalness: 0.5, roughness: 0.35 }),
  white: new THREE.MeshStandardMaterial({ color: CONFIG.colors.white }),
  headlight: new THREE.MeshStandardMaterial({ color: CONFIG.colors.headlight, emissive: CONFIG.colors.headlight, emissiveIntensity: 0.8 }),
  taillight: new THREE.MeshStandardMaterial({ color: CONFIG.colors.taillight, emissive: CONFIG.colors.taillight, emissiveIntensity: 1.4 }),
  signal: new THREE.MeshBasicMaterial({ color: CONFIG.colors.signal }),
};
const paints = new Map<string, THREE.MeshStandardMaterial>();
export function paint(color: string): THREE.MeshStandardMaterial {
  let material = paints.get(color);
  if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.15 }); paints.set(color, material); }
  return material;
}
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!result) throw new Error('Unable to merge procedural geometry');
  return result;
}
export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material); result.castShadow = true; result.receiveShadow = true; return result;
}

export interface CarModel { group: THREE.Group; wheels: THREE.Mesh[]; signalLeft: THREE.Mesh; signalRight: THREE.Mesh }
const c = CONFIG.car;
const body = merge([box(c.width, c.bodyHeight, c.length, 0, c.bodyY), box(c.cabinWidth, 0.08, c.cabinLength, 0, c.cabinY + c.cabinHeight / 2, c.cabinZ)]);
const glass = box(c.cabinWidth, c.cabinHeight, c.cabinLength, 0, c.cabinY, c.cabinZ);
const bumper = merge([box(c.width * 0.9, 0.12, 0.1, 0, 0.4, c.length / 2), box(c.width * 0.9, 0.12, 0.1, 0, 0.4, -c.length / 2)]);
const headlights = merge([-1, 1].map(side => box(c.lightWidth, c.lightHeight, 0.04, side * 0.48, c.bodyY + 0.08, -c.length / 2 - 0.01)));
const taillights = merge([-1, 1].map(side => box(c.lightWidth, c.lightHeight, 0.04, side * 0.48, c.bodyY + 0.08, c.length / 2 + 0.01)));
const wheel = new THREE.CylinderGeometry(c.wheelRadius, c.wheelRadius, c.wheelWidth, 12).rotateZ(Math.PI / 2);
const hub = new THREE.CylinderGeometry(c.wheelRadius * 0.48, c.wheelRadius * 0.48, c.wheelWidth + 0.01, 8).rotateZ(Math.PI / 2);
const staticWheels = merge([-1, 1].flatMap(x => [-1, 1].map(z => wheel.clone().translate(x * c.wheelX, c.wheelRadius, z * c.wheelZ))));
const stripes = merge([-1, 1].flatMap(side => [box(c.stripeWidth, 0.012, 0.9, side * c.stripeX, c.bodyY + c.bodyHeight / 2 + 0.008, -1.15), box(c.stripeWidth, 0.012, c.cabinLength, side * c.stripeX, c.cabinY + c.cabinHeight / 2 + 0.046, c.cabinZ), box(c.stripeWidth, 0.012, 0.64, side * c.stripeX, c.bodyY + c.bodyHeight / 2 + 0.008, 1.34)]));
const signal = box(0.17, 0.12, 0.055);
const truckBody = merge([box(c.truckWidth, 0.9, c.truckCabLength, 0, 0.9, -3.05), box(c.truckWidth, c.truckHeight - 0.65, 5.9, 0, 1.6, 1.2)]);
const truckGlass = box(c.truckWidth * 0.91, 0.65, c.truckCabLength * 0.9, 0, 1.65, -3.05);
const truckWheels = merge([-1, 1].flatMap(x => [-3.05, 1.65, 3.15].map(z => wheel.clone().scale(1.1, 1.15, 1.15).translate(x * 0.96, 0.37, z))));

export function buildCar(color: string, player = false, truck = false): CarModel {
  const group = new THREE.Group();
  group.add(mesh(truck ? truckBody : body, paint(color)), mesh(truck ? truckGlass : glass, materials.glass));
  const wheels: THREE.Mesh[] = [];
  if (player) {
    group.add(mesh(stripes, materials.white), mesh(bumper, materials.chrome));
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const tire = mesh(wheel, materials.tire); tire.position.set(x * c.wheelX, c.wheelRadius, z * c.wheelZ);
      tire.add(mesh(hub, materials.chrome)); group.add(tire); wheels.push(tire);
    }
  } else group.add(mesh(truck ? truckWheels : staticWheels, materials.tire));
  const front = mesh(headlights, materials.headlight), back = mesh(taillights, materials.taillight);
  if (truck) { front.position.z = -2.45; back.position.z = 2.48; }
  group.add(front, back);
  const signalLeft = mesh(signal, materials.signal), signalRight = mesh(signal, materials.signal);
  signalLeft.position.set(-c.width / 2, c.bodyY + 0.15, c.length / 2 + 0.025);
  signalRight.position.set(c.width / 2, c.bodyY + 0.15, c.length / 2 + 0.025);
  signalLeft.visible = false; signalRight.visible = false; group.add(signalLeft, signalRight);
  return { group, wheels, signalLeft, signalRight };
}
