import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { motion } from 'framer-motion';
import { Eye } from 'lucide-react';
import { formatNewsDate } from '@/lib/dateUtils';

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
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();

  const { angleOffset, tiltAngle, radiusOffset } = useMemo(() => {
    const angleStep = (Math.PI * 2) / total;
    return {
      angleOffset: angleStep * index,
      tiltAngle: (((index * 37) % 30) - 15) * (Math.PI / 180), // -15° to +15°
      radiusOffset: ((index * 1.3) % 1) * 0.8 - 0.4,           // -0.4 to +0.4
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

    // Elliptical orbit — no vertical bounce
    const x = planetPosition.x + Math.cos(angle) * effectiveRadius;
    const y = planetPosition.y + Math.sin(angle) * effectiveRadius * Math.sin(tiltAngle);
    const z = planetPosition.z + Math.sin(angle) * effectiveRadius * Math.cos(tiltAngle);

    groupRef.current.position.set(x, y, z);
    groupRef.current.lookAt(state.camera.position);
  });

  return (
    <group ref={groupRef}>
      {/* Static dot marker — no pulse, no glow sphere, no pointLight */}
      <mesh scale={0.14}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color={categoryColor}
          transparent
          opacity={hovered ? 1 : 0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Full news card */}
      <Html
        center
        distanceFactor={9}
        style={{
          pointerEvents: 'auto',
          userSelect: 'none',
          width: '260px',
        }}
        zIndexRange={hovered ? [10000, 0] : [100, 0]}
        occlude={false}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: 1, scale: hovered ? 0.62 : 0.48 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          onClick={() => navigate(`/news/${news.id}`)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="cursor-pointer"
          style={{ zIndex: hovered ? 9999 : 1, position: 'relative' }}
        >
          <Card
            className="backdrop-blur border-primary/30 hover:border-primary/70 transition-all shadow-xl"
            style={{
              backgroundColor: 'rgba(10,10,20,0.92)',
              borderColor: hovered ? categoryColor : undefined,
            }}
          >
            {news.image_url && (
              <div className="aspect-video w-full overflow-hidden rounded-t-lg">
                <img
                  src={news.image_url}
                  alt={news.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
            <CardHeader className="pb-2 pt-3 px-3">
              <div className="space-y-1.5">
                <Badge
                  variant="secondary"
                  className="text-xs"
                  style={{ backgroundColor: `${categoryColor}22`, color: categoryColor, borderColor: `${categoryColor}44` }}
                >
                  {news.category}
                </Badge>
                <CardTitle className="text-sm leading-tight line-clamp-2">
                  {news.title}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-1.5">
              {news.excerpt && (
                <p className="text-xs text-muted-foreground line-clamp-2">{news.excerpt}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {news.view_count ?? 0}
                </span>
                <span>{formatNewsDate(news.published_at)}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </Html>
    </group>
  );
}
