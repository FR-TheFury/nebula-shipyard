import * as THREE from 'three';

export interface CategoryTheme {
  primary: string;
  secondary: string;
  glow: string;
  particles: string;
  orbitRadius: number;
  orbitSpeed: number;
  orbitOffset: number;
  size: number;
  hasRing: boolean;
}

export const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  Update: {
    primary: '#FF6B35',
    secondary: '#FF3D00',
    glow: '#FF8C42',
    particles: '#FFAA00',
    orbitRadius: 7,
    orbitSpeed: 0.045,
    orbitOffset: 0,
    size: 1.4,
    hasRing: false,
  },
  Feature: {
    primary: '#4CC9F0',
    secondary: '#3A86FF',
    glow: '#7209B7',
    particles: '#00D9FF',
    orbitRadius: 11,
    orbitSpeed: 0.03,
    orbitOffset: Math.PI * 0.6,
    size: 1.7,
    hasRing: true,
  },
  'New Ships': {
    primary: '#00FF88',
    secondary: '#00CC6F',
    glow: '#00FFAA',
    particles: '#88FFCC',
    orbitRadius: 15,
    orbitSpeed: 0.022,
    orbitOffset: Math.PI * 1.2,
    size: 1.5,
    hasRing: false,
  },
  'Server Status': {
    primary: '#FFD700',
    secondary: '#FFA500',
    glow: '#FFEB3B',
    particles: '#FFF176',
    orbitRadius: 19,
    orbitSpeed: 0.015,
    orbitOffset: Math.PI * 1.8,
    size: 1.3,
    hasRing: true,
  },
};

export const GALAXY_VIEW_POSITION = new THREE.Vector3(0, 18, 35);
export const GALAXY_VIEW_TARGET = new THREE.Vector3(0, 0, 0);

/**
 * Calculate planet position at a given time on its orbit
 */
export function getPlanetPositionAtTime(category: string, time: number): THREE.Vector3 {
  const theme = CATEGORY_THEMES[category];
  if (!theme) return new THREE.Vector3(0, 0, 0);

  const angle = time * theme.orbitSpeed + theme.orbitOffset;
  const x = Math.cos(angle) * theme.orbitRadius;
  const z = Math.sin(angle) * theme.orbitRadius;
  const y = Math.sin(angle * 0.4) * 0.8;

  return new THREE.Vector3(x, y, z);
}

/**
 * Get initial planet position (at t=0)
 */
export function getPlanetPosition(category: string): THREE.Vector3 {
  return getPlanetPositionAtTime(category, 0);
}

/**
 * Get camera/lookAt for system view zoomed onto a planet position
 */
export function getSystemViewForPosition(planetPos: THREE.Vector3): {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
} {
  // Normalize direction to push camera back from origin toward planet
  const dir = planetPos.clone().normalize();
  return {
    position: planetPos
      .clone()
      .add(dir.multiplyScalar(4))
      .add(new THREE.Vector3(0, 3, 0)),
    lookAt: planetPos.clone(),
  };
}

/**
 * Legacy helper kept for compatibility
 */
export function getSystemViewPosition(category: string): {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
} {
  return getSystemViewForPosition(getPlanetPosition(category));
}

/**
 * Linear interpolation for Vector3
 */
export function lerpVector3(
  start: THREE.Vector3,
  end: THREE.Vector3,
  t: number
): THREE.Vector3 {
  return new THREE.Vector3(
    start.x + (end.x - start.x) * t,
    start.y + (end.y - start.y) * t,
    start.z + (end.z - start.z) * t
  );
}

/**
 * Easing function for smooth camera transitions
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
