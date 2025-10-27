import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
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

  // Calculate static position freely distributed in space
  useEffect(() => {
    if (!groupRef.current) return;

    const angleStep = (Math.PI * 2) / total;
    
    // Create pseudo-random but deterministic variations based on index
    const angleOffset = (index * 0.7) % 1; // Offset angle to break perfect circle
    const radiusVariation = ((index * 1.3) % 1) * 2 - 1; // -1 to 1
    const heightVariation = ((index * 1.7) % 1) * 4 - 2; // -2 to 2
    
    const angle = angleStep * index + angleOffset;
    const radius = orbitRadius + radiusVariation * 1.5; // Vary radius

    const x = planetPosition.x + Math.cos(angle) * radius;
    const y = planetPosition.y + heightVariation;
    const z = planetPosition.z + Math.sin(angle) * radius;

    groupRef.current.position.set(x, y, z);
  }, [index, total, planetPosition, orbitRadius]);

  useFrame((state) => {
    if (!groupRef.current) return;

    // Billboard effect only
    groupRef.current.lookAt(state.camera.position);
  });

  const handleClick = () => {
    navigate(`/news/${news.id}`);
  };

  return (
    <group ref={groupRef}>
      {/* HTML Content - Always visible */}
      <Html
        position={[0, 0, 0]}
        center
        distanceFactor={8}
        style={{
          pointerEvents: 'auto',
          userSelect: 'none',
          width: '280px',
          position: 'relative',
        }}
        zIndexRange={hovered ? [1000, 0] : [1, 0]}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 0.5 }}
          whileHover={{ scale: 0.675 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          onClick={handleClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="cursor-pointer"
          style={{ 
            position: 'relative',
            zIndex: hovered ? 9999 : 1,
          }}
        >
          <Card className="bg-card/95 backdrop-blur border-primary/30 hover:border-primary/60 transition-all shadow-lg hover:shadow-2xl hover:shadow-primary/40">
            {news.image_url && (
              <div className="aspect-video w-full overflow-hidden rounded-t-lg">
                <img
                  src={news.image_url}
                  alt={news.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <Badge variant="secondary" className="text-xs">
                  {news.category}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(news.published_at), { addSuffix: true })}
                </span>
              </div>
              <CardTitle className="text-base line-clamp-2">
                {news.title}
              </CardTitle>
            </CardHeader>
            {news.excerpt && (
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {news.excerpt}
                </p>
              </CardContent>
            )}
          </Card>
        </motion.div>
      </Html>

      {/* Small glow indicator */}
      <mesh scale={0.2}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial
          color="#4CC9F0"
          transparent
          opacity={hovered ? 0.8 : 0.4}
        />
      </mesh>
      
      <pointLight color="#4CC9F0" intensity={hovered ? 1 : 0.3} distance={3} />
    </group>
  );
}
