import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

interface NewsSatelliteProps {
  news: {
    id: number;
    title: string;
    excerpt: string | null;
    category: string;
    published_at: string;
    image_url: string | null;
  };
  index: number;
  total: number;
  planetPosition: THREE.Vector3;
  orbitRadius: number;
}

export default function NewsSatellite({ news, index, total, planetPosition, orbitRadius }: NewsSatelliteProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();

  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.getElapsedTime();
    const angleStep = (Math.PI * 2) / total;
    const angle = angleStep * index + time * 0.5;

    const x = planetPosition.x + Math.cos(angle) * orbitRadius;
    const y = planetPosition.y + Math.sin(angle) * 0.3;
    const z = planetPosition.z + Math.sin(angle) * orbitRadius;

    groupRef.current.position.set(x, y, z);

    // Billboard effect
    groupRef.current.lookAt(state.camera.position);
  });

  const handleClick = () => {
    navigate(`/news/${news.id}`);
  };

  return (
    <group ref={groupRef}>
      {/* Satellite Mesh */}
      <mesh
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={hovered ? 0.5 : 0.4}
      >
        <boxGeometry args={[1, 0.8, 0.3]} />
        <meshStandardMaterial
          color="#4CC9F0"
          emissive="#3A86FF"
          emissiveIntensity={hovered ? 0.8 : 0.3}
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>

      {/* Antenna */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
        <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.5} />
      </mesh>

      {/* Lights */}
      <pointLight color="#00D9FF" intensity={0.5} distance={2} />

      {/* Trail particles */}
      {hovered && (
        <pointLight color="#7209B7" intensity={1} distance={3} />
      )}

      {/* HTML Content */}
      {hovered && (
        <Html
          position={[0, 1, 0]}
          center
          distanceFactor={6}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            width: '250px',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <Card className="bg-background/95 backdrop-blur border-primary/50">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <Badge variant="secondary" className="text-xs">
                    {news.category}
                  </Badge>
                  <h3 className="text-sm font-semibold text-foreground line-clamp-2">
                    {news.title}
                  </h3>
                  {news.excerpt && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {news.excerpt}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(news.published_at), { addSuffix: true })}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </Html>
      )}
    </group>
  );
}
