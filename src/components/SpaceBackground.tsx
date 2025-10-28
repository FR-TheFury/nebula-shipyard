import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';

function HyperspaceParticles() {
  const particlesRef = useRef<THREE.Points>(null);
  
  const [positions, colors] = useMemo(() => {
    const particleCount = 1000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    const colorPalette = [
      new THREE.Color('#fb4dff'),
      new THREE.Color('#5f4dff'),
      new THREE.Color('#1ec8ff'),
      new THREE.Color('#ff904d'),
    ];
    
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
      
      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    
    return [positions, colors];
  }, []);
  
  useFrame((state) => {
    if (particlesRef.current) {
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 2] += 0.5; // Move towards camera
        
        if (positions[i + 2] > 25) {
          positions[i + 2] = -25;
        }
      }
      
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
      particlesRef.current.rotation.z += 0.0005;
    }
  });
  
  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function NeonTrails() {
  const trailsRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (trailsRef.current) {
      trailsRef.current.rotation.z = state.clock.elapsedTime * 0.05;
    }
  });
  
  return (
    <group ref={trailsRef}>
      {[...Array(20)].map((_, i) => {
        const angle = (i / 20) * Math.PI * 2;
        const radius = 15 + i * 0.5;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        return (
          <mesh key={i} position={[x, y, -20]}>
            <boxGeometry args={[0.05, 0.05, 40]} />
            <meshBasicMaterial
              color={i % 2 === 0 ? '#fb4dff' : '#1ec8ff'}
              transparent
              opacity={0.3}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function SpaceBackground() {
  return (
    <div className="fixed inset-0 -z-10">
      <Canvas camera={{ position: [0, 0, 10], fov: 75 }}>
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={0.5} color="#fb4dff" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#1ec8ff" />
        
        <Stars
          radius={100}
          depth={50}
          count={3000}
          factor={4}
          saturation={0}
          fade
          speed={2}
        />
        
        <HyperspaceParticles />
        <NeonTrails />
      </Canvas>
    </div>
  );
}
