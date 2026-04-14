import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';

interface NewsSatelliteProps {
  news: {
    id: number;
    title: string;
    excerpt: string | null;
    category: string;
    published_at: string;
    image_url: string | null;
    view_count: number | null;
  };
  index: number;
  total: number;
  planetPosition: THREE.Vector3;
  orbitRadius: number;
}

const ORBIT_SPEED = 0.04; // Slow, smooth orbit

export default function NewsSatellite({
  news,
  index,
  total,
  planetPosition,
  orbitRadius,
}: NewsSatelliteProps) {
  const groupRef = useRef<THREE.Group>(null);
  const dotRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();

  const { angleOffset, tiltAngle, radiusOffset, phaseOffset } = useMemo(() => {
    const angleStep = (Math.PI * 2) / total;
    return {
      angleOffset: angleStep * index,
      tiltAngle: (((index * 37) % 30) - 15) * (Math.PI / 180), // -15° to +15°
      radiusOffset: ((index * 1.3) % 1) * 0.8 - 0.4,           // -0.4 to +0.4
      phaseOffset: (index * 0.7) % (Math.PI * 2),
    };
  }, [index, total]);

  const effectiveRadius = orbitRadius + radiusOffset;

  const categoryColor =
    news.category === 'Update'
      ? '#FF6B35'
      : news.category === 'Feature'
      ? '#4CC9F0'
      : news.category === 'New Ships'
      ? '#00FF88'
      : news.category === 'Server Status'
      ? '#FFD700'
      : '#A855F7';

  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.getElapsedTime();
    const angle = angleOffset + time * ORBIT_SPEED * (1 + (index % 3) * 0.15);

    // Elliptical orbit, no vertical bounce
    const x = planetPosition.x + Math.cos(angle) * effectiveRadius;
    const y = planetPosition.y + Math.sin(angle) * effectiveRadius * Math.sin(tiltAngle);
    const z = planetPosition.z + Math.sin(angle) * effectiveRadius * Math.cos(tiltAngle);

    groupRef.current.position.set(x, y, z);

    // Subtle pulse on dot
    if (dotRef.current) {
      const pulse = 1 + Math.sin(time * 2.2 + phaseOffset) * 0.15;
      dotRef.current.scale.setScalar(pulse);
    }
    // Outer glow follows hover state
    if (glowRef.current) {
      const targetScale = hovered ? 0.55 : 0.32;
      glowRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.12
      );
    }
  });

  return (
    <group ref={groupRef}>
      {/* Core dot */}
      <mesh
        ref={dotRef}
        scale={0.18}
        onClick={() => navigate(`/news/${news.id}`)}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color={categoryColor}
          transparent
          opacity={hovered ? 1 : 0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Outer glow sphere — no pointLight, purely visual */}
      <mesh ref={glowRef} scale={0.32}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color={categoryColor}
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Hover tooltip — just shows title, clean and minimal */}
      {hovered && (
        <Html
          center
          distanceFactor={11}
          style={{ pointerEvents: 'none', width: '210px' }}
          zIndexRange={[9999, 0]}
        >
          <div
            style={{
              background: 'rgba(4, 6, 20, 0.92)',
              border: `1px solid ${categoryColor}55`,
              borderRadius: '7px',
              padding: '7px 11px',
              backdropFilter: 'blur(10px)',
              boxShadow: `0 2px 16px ${categoryColor}22`,
            }}
          >
            <div
              style={{
                color: categoryColor,
                fontSize: '9px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: '4px',
                fontWeight: 600,
              }}
            >
              {news.category}
            </div>
            <div
              style={{
                color: 'rgba(255,255,255,0.92)',
                fontSize: '11px',
                lineHeight: '1.35',
                fontWeight: 500,
              }}
            >
              {news.title.length > 65 ? news.title.slice(0, 65) + '…' : news.title}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
