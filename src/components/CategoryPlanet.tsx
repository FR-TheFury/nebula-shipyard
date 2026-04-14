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
  newShipsPlanetVertexShader,
  newShipsPlanetFragmentShader,
  serverStatusPlanetVertexShader,
  serverStatusPlanetFragmentShader,
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from '@/shaders/planet';
import { CATEGORY_THEMES, getPlanetPositionAtTime } from '@/utils/galacticMap';

interface CategoryPlanetProps {
  category: string;
  newsCount: number;
  onClick: (position: THREE.Vector3) => void;
  /** When true the planet stops orbiting and sits at lockedPosition */
  isLocked?: boolean;
  lockedPosition?: THREE.Vector3;
}

export default function CategoryPlanet({
  category,
  newsCount,
  onClick,
  isLocked = false,
  lockedPosition,
}: CategoryPlanetProps) {
  const groupRef = useRef<THREE.Group>(null);
  const planetRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const currentPos = useRef(new THREE.Vector3());

  const theme = CATEGORY_THEMES[category as keyof typeof CATEGORY_THEMES];

  const getShaders = () => {
    switch (category) {
      case 'Update':
        return { vertex: updatePlanetVertexShader, fragment: updatePlanetFragmentShader };
      case 'Feature':
        return { vertex: featurePlanetVertexShader, fragment: featurePlanetFragmentShader };
      case 'New Ships':
        return { vertex: newShipsPlanetVertexShader, fragment: newShipsPlanetFragmentShader };
      case 'Server Status':
        return { vertex: serverStatusPlanetVertexShader, fragment: serverStatusPlanetFragmentShader };
      default:
        return { vertex: featurePlanetVertexShader, fragment: featurePlanetFragmentShader };
    }
  };

  const shaders = getShaders();
  const size = theme?.size ?? 1.5;

  const planetUniforms = useRef({ time: { value: 0 } });
  const atmosphereUniforms = useRef({
    glowColor: { value: new THREE.Color(theme?.glow ?? '#FFFFFF') },
  });

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    planetUniforms.current.time.value = time;

    if (!groupRef.current) return;

    if (isLocked && lockedPosition) {
      // In system view: stay at locked position
      groupRef.current.position.copy(lockedPosition);
    } else {
      // Galaxy view: orbit the sun
      const pos = getPlanetPositionAtTime(category, time);
      groupRef.current.position.copy(pos);
      currentPos.current.copy(pos);
    }

    if (planetRef.current) {
      planetRef.current.rotation.y += 0.003;
    }
    if (atmosphereRef.current) {
      const scale = size * (1.35 + Math.sin(time * 1.5) * 0.04);
      atmosphereRef.current.scale.setScalar(scale);
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += 0.001;
    }
  });

  const handleClick = () => {
    onClick(currentPos.current.clone());
  };

  return (
    <group ref={groupRef}>
      {/* Main Planet */}
      <mesh
        ref={planetRef}
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={hovered ? size * 1.12 : size}
      >
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          vertexShader={shaders.vertex}
          fragmentShader={shaders.fragment}
          uniforms={planetUniforms.current}
        />
      </mesh>

      {/* Atmosphere Glow */}
      <mesh ref={atmosphereRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <shaderMaterial
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          uniforms={atmosphereUniforms.current}
          transparent
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Optional ring */}
      {theme?.hasRing && (
        <mesh ref={ringRef} rotation={[Math.PI / 2.4, 0, 0]}>
          <torusGeometry args={[size * 1.6, 0.04, 16, 100]} />
          <meshBasicMaterial
            color={theme.primary}
            transparent
            opacity={0.55}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Point light */}
      <pointLight color={theme?.glow ?? '#FFFFFF'} intensity={hovered ? 3 : 1.5} distance={12} />

      {/* Category label */}
      <Html
        position={[0, size * 1.9, 0]}
        center
        distanceFactor={10}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: hovered ? 1 : 0.75, y: 0 }}
          className="flex flex-col items-center gap-1"
        >
          <div className="text-white font-bold text-lg tracking-wider drop-shadow-lg whitespace-nowrap">
            {category}
          </div>
          <Badge
            variant="default"
            className="text-xs"
            style={{ backgroundColor: theme?.primary ?? '#FFFFFF', color: '#000' }}
          >
            {newsCount} news
          </Badge>
        </motion.div>
      </Html>
    </group>
  );
}
