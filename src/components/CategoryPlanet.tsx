import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Badge } from './ui/badge';
import { motion } from 'framer-motion';
import {
  updatePlanetVertexShader,
  updatePlanetFragmentShader,
  featurePlanetVertexShader,
  featurePlanetFragmentShader,
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from '@/shaders/planet';
import { CATEGORY_THEMES } from '@/utils/galacticMap';

interface CategoryPlanetProps {
  category: string;
  position: THREE.Vector3;
  newsCount: number;
  onClick: () => void;
}

export default function CategoryPlanet({ category, position, newsCount, onClick }: CategoryPlanetProps) {
  const planetRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const theme = CATEGORY_THEMES[category as keyof typeof CATEGORY_THEMES];
  const isUpdate = category === 'Update';

  const planetUniforms = useRef({
    time: { value: 0 },
  });

  const atmosphereUniforms = useRef({
    glowColor: {
      value: new THREE.Color(theme?.glow || '#FFFFFF'),
    },
  });

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    planetUniforms.current.time.value = time;

    if (planetRef.current) {
      planetRef.current.rotation.y += 0.001;
    }

    if (atmosphereRef.current) {
      const pulseScale = 1 + Math.sin(time * 2) * 0.05;
      atmosphereRef.current.scale.setScalar(pulseScale * 1.4);
    }

    if (ringRef.current) {
      ringRef.current.rotation.z += 0.002;
    }
  });

  return (
    <group position={position}>
      {/* Main Planet */}
      <mesh
        ref={planetRef}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={hovered ? 1.1 : 1}
      >
        <sphereGeometry args={[1.5, 64, 64]} />
        <shaderMaterial
          vertexShader={isUpdate ? updatePlanetVertexShader : featurePlanetVertexShader}
          fragmentShader={isUpdate ? updatePlanetFragmentShader : featurePlanetFragmentShader}
          uniforms={planetUniforms.current}
        />
      </mesh>

      {/* Atmosphere Glow */}
      <mesh ref={atmosphereRef} scale={1.4}>
        <sphereGeometry args={[1.5, 64, 64]} />
        <shaderMaterial
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          uniforms={atmosphereUniforms.current}
          transparent
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2, 0.05, 16, 100]} />
        <meshBasicMaterial color={theme?.primary || '#FFFFFF'} transparent opacity={0.6} />
      </mesh>

      {/* Point Light */}
      <pointLight color={theme?.glow || '#FFFFFF'} intensity={2} distance={10} />

      {/* Category Label & Badge */}
      <Html
        position={[0, 2.5, 0]}
        center
        distanceFactor={8}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: hovered ? 1 : 0.8, y: 0 }}
          className="flex flex-col items-center gap-2"
        >
          <div className="text-white font-bold text-xl tracking-wider drop-shadow-glow">
            {category}
          </div>
          <Badge
            variant="default"
            className="text-sm"
            style={{
              backgroundColor: theme?.primary || '#FFFFFF',
              color: '#000',
            }}
          >
            {newsCount} {newsCount === 1 ? 'News' : 'News'}
          </Badge>
        </motion.div>
      </Html>
    </group>
  );
}
