import * as THREE from 'three';

/** Floor plan constants (metres). +z faces the street, x runs along the shop front. */
export const L = {
  floor: { minX: -7, maxX: 7, minZ: -5, maxZ: 5 },
  back: { minX: -7, maxX: 7, minZ: -8.6, maxZ: -5.15 },
  ceiling: 2.8,
  backCeiling: 2.6,
  wallT: 0.15,
  entrance: { minX: -5.3, maxX: -3.7, z: 5 },
  staffDoor: { minX: 5.25, maxX: 6.25, z: -5.08 },
  counter: { minX: 3.9, maxX: 4.6, minZ: 0.2, maxZ: 3.9, h: 0.95 },
  backCounter: { minX: 6.35, maxX: 7, minZ: -0.7, maxZ: 4.2 },
  staffArea: { minX: 4.6, maxX: 7, minZ: -5, maxZ: 5 },
  register: { z: 2.95 },
  gondolas: [
    { cx: -1.4, cz: -2.2 },
    { cx: -1.4, cz: 0.15 },
    { cx: -1.4, cz: 2.5 },
  ],
  gondolaLen: 4.2,
  gondolaDepth: 0.9,
};

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Key positions used by NPC behaviour. */
export const P = {
  outsideSpawnL: V(-13.5, 0, 17),
  outsideSpawnR: V(13.5, 0, 17),
  doorOutside: V(-4.5, 0, 6.4),
  doorInside: V(-4.5, 0, 4.1),
  registerCustomer: V(3.35, 0, L.register.z),
  registerStaff: V(5.0, 0, L.register.z),
  /** Queue spots behind the one being served. */
  queue: [V(3.3, 0, 2.15), V(3.3, 0, 1.35), V(3.3, 0, 0.55), V(3.1, 0, -0.25), V(2.6, 0, -0.9)],
  deliveryDrop: V(0.4, 0, -7.2),
  staffDoorFront: V(5.75, 0, -4.4),
  staffDoorBack: V(5.75, 0, -5.8),
  magazineSpots: [V(-2.6, 0, 3.95), V(-1.2, 0, 3.95), V(0.2, 0, 3.95), V(1.6, 0, 3.95)],
  loiterOutside: V(-6.2, 0, 7.2),
};
