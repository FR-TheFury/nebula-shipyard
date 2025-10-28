import * as THREE from 'three';

export const CATEGORY_THEMES = {
  Update: {
    primary: '#FF6B35',
    secondary: '#FF3D00',
    glow: '#FF8C42',
    particles: '#FFAA00',
  },
  Feature: {
    primary: '#4CC9F0',
    secondary: '#3A86FF',
    glow: '#7209B7',
    particles: '#00D9FF',
  },
  'New Ships': {
    primary: '#00FF88',
    secondary: '#00CC6F',
    glow: '#00FFAA',
    particles: '#88FFCC',
  },
  'Server Status': {
    primary: '#FFD700',
    secondary: '#FFA500',
    glow: '#FFEB3B',
    particles: '#FFF176',
  },
};

export const PLANET_POSITIONS = {
  Update: new THREE.Vector3(5, 0, 5),
  Feature: new THREE.Vector3(-5, 2, -3),
  'New Ships': new THREE.Vector3(-8, -1, 4),
  'Server Status': new THREE.Vector3(6, 3, -5),
};

export const GALAXY_VIEW_POSITION = new THREE.Vector3(0, 8, 20);
export const GALAXY_VIEW_TARGET = new THREE.Vector3(0, 0, 0);

/**
 * Get planet position by category
 */
export function getPlanetPosition(category: string): THREE.Vector3 {
  return PLANET_POSITIONS[category as keyof typeof PLANET_POSITIONS] || new THREE.Vector3(0, 0, 0);
}

/**
 * Calculate satellite orbit position around a planet
 */
export function getSatelliteOrbitPosition(
  index: number,
  total: number,
  time: number,
  planetPosition: THREE.Vector3,
  orbitRadius: number = 2
): THREE.Vector3 {
  const angleStep = (Math.PI * 2) / total;
  const angle = angleStep * index + time * 0.5;
  
  const x = planetPosition.x + Math.cos(angle) * orbitRadius;
  const y = planetPosition.y + Math.sin(angle) * 0.3;
  const z = planetPosition.z + Math.sin(angle) * orbitRadius;
  
  return new THREE.Vector3(x, y, z);
}

/**
 * Linear interpolation for Vector3
 */
export function lerpVector3(start: THREE.Vector3, end: THREE.Vector3, t: number): THREE.Vector3 {
  return new THREE.Vector3(
    start.x + (end.x - start.x) * t,
    start.y + (end.y - start.y) * t,
    start.z + (end.z - start.z) * t
  );
}

/**
 * Easing function for smooth transitions
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Get system view camera position for a category
 */
export function getSystemViewPosition(category: string): { position: THREE.Vector3; lookAt: THREE.Vector3 } {
  const planetPos = getPlanetPosition(category);
  
  return {
    position: new THREE.Vector3(
      planetPos.x + 4,
      planetPos.y + 3,
      planetPos.z + 6
    ),
    lookAt: planetPos.clone(),
  };
}
