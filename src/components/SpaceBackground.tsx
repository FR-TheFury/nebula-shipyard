import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Float } from '@react-three/drei';
import * as THREE from 'three';

function AnimatedSphere({ position, color, scale = 1 }: { position: [number, number, number], color: string, scale?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.2;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={meshRef} position={position} scale={scale}>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          roughness={0.3}
          metalness={0.8}
        />
      </mesh>
    </Float>
  );
}

function RotatingRing({ position, color }: { position: [number, number, number], color: string }) {
  const ringRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.3;
      ringRef.current.rotation.x = Math.PI / 4;
    }
  });

  return (
    <mesh ref={ringRef} position={position}>
      <torusGeometry args={[2, 0.05, 16, 100]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.3}
        transparent
        opacity={0.6}
      />
    </mesh>
  );
}

export function SpaceBackground() {
  return (
    <div className="fixed inset-0 -z-10">
      <Canvas camera={{ position: [0, 0, 10], fov: 50 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        
        <Stars
          radius={100}
          depth={50}
          count={5000}
          factor={4}
          saturation={0}
          fade
          speed={1}
        />
        
        {/* Neon spheres */}
        <AnimatedSphere position={[-3, 2, -5]} color="#fb4dff" scale={0.8} />
        <AnimatedSphere position={[3, -1, -8]} color="#5f4dff" scale={1.2} />
        <AnimatedSphere position={[0, 1, -6]} color="#1ec8ff" scale={0.6} />
        <AnimatedSphere position={[-2, -2, -7]} color="#ff904d" scale={0.9} />
        
        {/* Rotating rings */}
        <RotatingRing position={[0, 0, -5]} color="#fb4dff" />
      </Canvas>
    </div>
  );
}
