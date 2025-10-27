import * as THREE from 'three';

export const ORBIT_CONFIG = {
  innerRadius: 4,
  outerRadius: 8,
  tiltAngle: 25,
  rotationSpeed: 0.15,
  newsPerOrbit: 3,
};

/**
 * Calculate 3D position on orbit for a news item
 */
export function calculateOrbitPosition(
  index: number,
  total: number,
  time: number,
  baseRadius: number,
  orbitIndex: number = 0
): THREE.Vector3 {
  const { tiltAngle, rotationSpeed } = ORBIT_CONFIG;
  
  // Calculate angle for this item
  const angleStep = (Math.PI * 2) / total;
  const angle = angleStep * index + time * rotationSpeed;
  
  // Add variation to radius based on orbit index
  const radius = baseRadius + orbitIndex * 1.5;
  
  // Calculate position
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * Math.sin(tiltAngle * (Math.PI / 180)) * radius * 0.3;
  const z = Math.sin(angle) * radius;
  
  return new THREE.Vector3(x, y, z);
}

/**
 * Get opacity based on Z position (front = opaque, back = transparent)
 */
export function getCardOpacity(zPosition: number): number {
  // Normalize z position (-1 to 1)
  const normalized = Math.max(-1, Math.min(1, zPosition / 8));
  
  if (normalized > 0) {
    // Front: 80% to 100%
    return 0.8 + normalized * 0.2;
  } else {
    // Back: 20% to 80%
    return 0.8 + normalized * 0.6;
  }
}

/**
 * Get glow intensity based on Z position
 */
export function getCardGlow(zPosition: number): number {
  const normalized = Math.max(-1, Math.min(1, zPosition / 8));
  
  if (normalized > 0) {
    // Front: strong glow
    return 0.5 + normalized * 0.5;
  } else {
    // Back: weak glow
    return 0.1;
  }
}

/**
 * Get scale based on Z position (closer = bigger)
 */
export function getCardScale(zPosition: number, baseScale: number = 1): number {
  const normalized = Math.max(-1, Math.min(1, zPosition / 8));
  
  // Front items are 20% bigger
  return baseScale * (1 + normalized * 0.2);
}

/**
 * Check if card should be rendered (frustum culling optimization)
 */
export function shouldRenderCard(position: THREE.Vector3, cameraPosition: THREE.Vector3): boolean {
  const distance = position.distanceTo(cameraPosition);
  return distance < 20; // Only render if within 20 units
}

/**
 * Get orbit ring color based on index
 */
export function getOrbitColor(index: number): string {
  const colors = [
    '#FF6B35', // Orange
    '#F72585', // Pink
    '#7209B7', // Purple
    '#3A0CA3', // Deep blue
    '#4CC9F0', // Cyan
  ];
  return colors[index % colors.length];
}
