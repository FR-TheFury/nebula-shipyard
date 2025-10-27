import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Stars, Float } from '@react-three/drei';
import { EffectComposer, Bloom, DepthOfField } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import type { Tables } from '@/integrations/supabase/types';
import {
  hologramVertexShader,
  hologramFragmentShader,
  sunVertexShader,
  sunFragmentShader,
} from '@/shaders/hologram';
import {
  calculateOrbitPosition,
  getCardOpacity,
  getCardGlow,
  getCardScale,
  ORBIT_CONFIG,
  getOrbitColor,
} from '@/utils/orbit3D';

type NewsItem = Tables<'news'>;

// Central Sun Component
function CentralSun() {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = clock.getElapsedTime() * 0.2;
      meshRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.3) * 0.1;
    }
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = clock.getElapsedTime();
    }
  });

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
    }),
    []
  );

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.2, 64, 64]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={sunVertexShader}
          fragmentShader={sunFragmentShader}
          uniforms={uniforms}
          transparent={false}
        />
      </mesh>
      <pointLight intensity={2} distance={20} color="#ff6b35" />
      <pointLight intensity={1} distance={15} color="#f72585" position={[0, 1, 0]} />
    </group>
  );
}

// Orbit Ring Component
function OrbitRing({ radius, index }: { radius: number; index: number }) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.rotation.y = clock.getElapsedTime() * 0.1 * (index + 1);
    }
  });

  const color = getOrbitColor(index);

  return (
    <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.02, 16, 100]} />
      <meshBasicMaterial color={color} transparent opacity={0.2} />
    </mesh>
  );
}

// Individual News Card 3D Component
function NewsCard3D({ news, index, total }: { news: NewsItem; index: number; total: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const navigate = useNavigate();
  const { camera } = useThree();

  // Calculate which orbit this card belongs to
  const orbitIndex = Math.floor(index / ORBIT_CONFIG.newsPerOrbit);
  const baseRadius = ORBIT_CONFIG.innerRadius + orbitIndex * 1.5;

  useFrame(({ clock }) => {
    if (groupRef.current) {
      const time = clock.getElapsedTime();
      const position = calculateOrbitPosition(
        index % ORBIT_CONFIG.newsPerOrbit,
        ORBIT_CONFIG.newsPerOrbit,
        time,
        baseRadius,
        orbitIndex
      );

      groupRef.current.position.copy(position);

      // Billboard effect - always face camera
      groupRef.current.lookAt(camera.position);

      // Update shader uniforms
      if (materialRef.current) {
        materialRef.current.uniforms.time.value = time;
        materialRef.current.uniforms.zPosition.value = position.z;
        materialRef.current.uniforms.opacity.value = getCardOpacity(position.z);
      }

      // Scale based on distance
      const scale = getCardScale(position.z, hovered ? 1.2 : 1);
      groupRef.current.scale.setScalar(scale);
    }
  });

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      opacity: { value: 1 },
      zPosition: { value: 0 },
      glowColor: { value: new THREE.Color('#4cc9f0') },
    }),
    []
  );

  const handleClick = () => {
    navigate(`/news/${news.id}`);
  };

  return (
    <group ref={groupRef}>
      {/* Hologram background plane */}
      <mesh>
        <planeGeometry args={[2.5, 1.8]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={hologramVertexShader}
          fragmentShader={hologramFragmentShader}
          uniforms={uniforms}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* HTML Content overlay */}
      <Html
        transform
        distanceFactor={1.5}
        position={[0, 0, 0.01]}
        style={{ pointerEvents: hovered ? 'auto' : 'none' }}
      >
        <motion.div
          onHoverStart={() => setHovered(true)}
          onHoverEnd={() => setHovered(false)}
          onClick={handleClick}
          whileHover={{ scale: 1.05 }}
          className="cursor-pointer"
        >
          <Card className="w-64 bg-background/80 backdrop-blur-md border-primary/40 hover:border-primary transition-all">
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-semibold line-clamp-2 text-foreground">
                  {news.title}
                </CardTitle>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {news.category}
                </Badge>
              </div>
              {news.excerpt && (
                <CardDescription className="text-xs line-clamp-2">
                  {news.excerpt}
                </CardDescription>
              )}
              {news.published_at && (
                <p className="text-xs text-muted-foreground">
                  {format(new Date(news.published_at), 'MMM dd, yyyy')}
                </p>
              )}
            </CardHeader>
          </Card>
        </motion.div>
      </Html>

      {/* Glow sphere when hovered */}
      {hovered && (
        <mesh>
          <sphereGeometry args={[1.5, 32, 32]} />
          <meshBasicMaterial color="#4cc9f0" transparent opacity={0.1} />
        </mesh>
      )}
    </group>
  );
}

// Particles Component
function CosmicParticles() {
  const particlesRef = useRef<THREE.Points>(null);

  useFrame(({ clock }) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = clock.getElapsedTime() * 0.05;
    }
  });

  const particlesCount = 200;
  const positions = useMemo(() => {
    const pos = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount; i++) {
      const radius = 3 + Math.random() * 12;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;

      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = radius * Math.cos(phi);
    }
    return pos;
  }, []);

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particlesCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#4cc9f0" transparent opacity={0.6} />
    </points>
  );
}

// Main Scene Component
function Scene({ newsItems }: { newsItems: NewsItem[] }) {
  const controlsRef = useRef<any>(null);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />

      {/* Background */}
      <Stars radius={100} depth={50} count={5000} factor={4} fade speed={1} />

      {/* Central Sun */}
      <CentralSun />

      {/* Orbit Rings */}
      {[0, 1, 2].map((i) => (
        <OrbitRing
          key={i}
          radius={ORBIT_CONFIG.innerRadius + i * 1.5}
          index={i}
        />
      ))}

      {/* News Cards */}
      {newsItems.map((news, index) => (
        <NewsCard3D key={news.id} news={news} index={index} total={newsItems.length} />
      ))}

      {/* Cosmic Particles */}
      <CosmicParticles />

      {/* Camera Controls */}
      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        autoRotate={true}
        autoRotateSpeed={0.3}
        minDistance={5}
        maxDistance={18}
        enableDamping
        dampingFactor={0.05}
      />

      {/* Post Processing Effects */}
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.5} />
        <DepthOfField focusDistance={0} focalLength={0.02} bokehScale={2} />
      </EffectComposer>
    </>
  );
}

// Main Component
export function NewsOrbit3D() {
  const { data: newsItems, isLoading } = useQuery({
    queryKey: ['latest-news'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(9);

      if (error) throw error;
      return data as NewsItem[];
    },
  });

  if (isLoading) {
    return (
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Latest News</h2>
          </div>
          <Skeleton className="w-full h-[600px] rounded-xl" />
        </div>
      </section>
    );
  }

  if (!newsItems || newsItems.length === 0) {
    return (
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-4">Latest News</h2>
          <p className="text-muted-foreground">No news available at the moment.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20 relative">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary via-pink-500 to-purple-500 bg-clip-text text-transparent">
            Latest News
          </h2>
          <p className="text-muted-foreground">Drag to rotate • Scroll to zoom • Click to read</p>
        </div>

        <div className="w-full h-[600px] rounded-xl overflow-hidden border border-primary/20 bg-background/50 backdrop-blur-sm">
          <Canvas
            camera={{ position: [0, 2, 10], fov: 50 }}
            gl={{ antialias: true, alpha: true }}
          >
            <Scene newsItems={newsItems} />
          </Canvas>
        </div>
      </div>
    </section>
  );
}
