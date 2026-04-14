import { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Stars, OrbitControls } from '@react-three/drei';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import CategoryPlanet from './CategoryPlanet';
import NewsSatellite from './NewsSatellite';
import NavigationPanel from './NavigationPanel';
import MiniMap from './MiniMap';
import NewsFilters, { NewsFilterOptions } from './NewsFilters';
import NewsGrid2D from './NewsGrid2D';
import { useNewsFilters } from '@/hooks/useNewsFilters';
import { Button } from './ui/button';
import { Grid3x3, Globe, ArrowLeft, X, Eye } from 'lucide-react';
import {
  CategoryTheme,
  CATEGORY_THEMES,
  GALAXY_VIEW_POSITION,
  GALAXY_VIEW_TARGET,
  getSystemViewForPosition,
  lerpVector3,
  easeInOutCubic,
} from '@/utils/galacticMap';
import { Skeleton } from './ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { sunVertexShader, sunFragmentShader } from '@/shaders/hologram';
import { formatNewsDate } from '@/lib/dateUtils';

// ─────────────────────────────────────────────────────────────
// Camera controller: smooth eased transitions
// ─────────────────────────────────────────────────────────────
interface CameraControllerProps {
  targetPosition: THREE.Vector3;
  targetLookAt: THREE.Vector3;
  isTransitioning: boolean;
  onTransitionComplete: () => void;
  onCameraUpdate?: (position: THREE.Vector3, rotation: THREE.Euler) => void;
}

function CameraController({
  targetPosition,
  targetLookAt,
  isTransitioning,
  onTransitionComplete,
  onCameraUpdate,
}: CameraControllerProps) {
  const { camera } = useThree();
  const startPos = useRef(new THREE.Vector3());
  const startLook = useRef(new THREE.Vector3());
  const startTime = useRef(0);
  const transitioning = useRef(false);
  const DURATION = 1800;

  useEffect(() => {
    if (isTransitioning) {
      startPos.current.copy(camera.position);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      startLook.current.copy(camera.position).add(dir);
      startTime.current = Date.now();
      transitioning.current = true;
    }
  }, [isTransitioning, camera]);

  useFrame(() => {
    if (transitioning.current) {
      const elapsed = Date.now() - startTime.current;
      const t = Math.min(elapsed / DURATION, 1);
      const easedT = easeInOutCubic(t);

      camera.position.copy(lerpVector3(startPos.current, targetPosition, easedT));
      const lookAt = lerpVector3(startLook.current, targetLookAt, easedT);
      camera.lookAt(lookAt);

      if (t >= 1) {
        transitioning.current = false;
        onTransitionComplete();
      }
    }

    if (onCameraUpdate) {
      onCameraUpdate(camera.position.clone(), camera.rotation.clone());
    }
  });

  return null;
}

// ─────────────────────────────────────────────────────────────
// Central Sun — plasma core + layered corona
// ─────────────────────────────────────────────────────────────
function CentralSun() {
  const meshRef = useRef<THREE.Mesh>(null);
  const corona1Ref = useRef<THREE.Mesh>(null);
  const corona2Ref = useRef<THREE.Mesh>(null);
  const corona3Ref = useRef<THREE.Mesh>(null);
  const diskRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(() => ({ time: { value: 0 } }), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    uniforms.time.value = t;

    if (meshRef.current) meshRef.current.rotation.y = t * 0.12;

    if (corona1Ref.current) {
      const s = 1.6 + Math.sin(t * 0.9) * 0.07;
      corona1Ref.current.scale.setScalar(s);
    }
    if (corona2Ref.current) {
      const s = 2.1 + Math.sin(t * 0.55 + 1) * 0.09;
      corona2Ref.current.scale.setScalar(s);
    }
    if (corona3Ref.current) {
      const s = 2.9 + Math.sin(t * 0.35 + 2) * 0.12;
      corona3Ref.current.scale.setScalar(s);
      corona3Ref.current.rotation.y = t * 0.04;
    }
    if (diskRef.current) {
      diskRef.current.rotation.z = t * 0.06;
    }
  });

  return (
    <group>
      {/* Core plasma */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.4, 64, 64]} />
        <shaderMaterial
          vertexShader={sunVertexShader}
          fragmentShader={sunFragmentShader}
          uniforms={uniforms}
        />
      </mesh>

      {/* Corona layer 1 — tight */}
      <mesh ref={corona1Ref}>
        <sphereGeometry args={[1.4, 32, 32]} />
        <meshBasicMaterial
          color="#FF8C00"
          transparent
          opacity={0.10}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Corona layer 2 — mid */}
      <mesh ref={corona2Ref}>
        <sphereGeometry args={[1.4, 24, 24]} />
        <meshBasicMaterial
          color="#FF5500"
          transparent
          opacity={0.055}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Corona layer 3 — wide outer glow */}
      <mesh ref={corona3Ref}>
        <sphereGeometry args={[1.4, 16, 16]} />
        <meshBasicMaterial
          color="#F72585"
          transparent
          opacity={0.025}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Equatorial disc ring */}
      <mesh ref={diskRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.0, 0.06, 16, 120]} />
        <meshBasicMaterial
          color="#FF8C42"
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Lights */}
      <pointLight intensity={8} distance={50} color="#FF8C42" />
      <pointLight intensity={3.5} distance={28} color="#F72585" position={[0, 1.5, 0]} />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
// Orbit path ring — double-ring glow effect
// ─────────────────────────────────────────────────────────────
function OrbitalPath({ radius, color }: { radius: number; color: string }) {
  return (
    <>
      {/* Core line */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.022, 8, 200]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.38}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Soft halo */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.18, 8, 200]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Ecliptic grid — gives a "3D space map" feel
// ─────────────────────────────────────────────────────────────
function EclipticGrid() {
  const gridObj = useMemo(() => {
    const group = new THREE.Group();

    // Concentric rings at orbital radii
    const ringMat = new THREE.LineBasicMaterial({
      color: '#1a3050',
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    [4, 7, 11, 15, 19, 23].forEach((r) => {
      const pts = Array.from({ length: 129 }, (_, i) => {
        const a = (i / 128) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      });
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat.clone()));
    });

    // Radial spokes every 30°
    const spokeMat = new THREE.LineBasicMaterial({
      color: '#0d2040',
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      group.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(Math.cos(a) * 24, 0, Math.sin(a) * 24),
          ]),
          spokeMat.clone()
        )
      );
    }

    return group;
  }, []);

  useFrame(({ clock }) => {
    gridObj.rotation.y = clock.getElapsedTime() * 0.003;
  });

  return <primitive object={gridObj} />;
}

// ─────────────────────────────────────────────────────────────
// Nebula / ambient particle cloud — richer and more vibrant
// ─────────────────────────────────────────────────────────────
function NebulaCloud() {
  const innerRef = useRef<THREE.Points>(null);
  const outerRef = useRef<THREE.Points>(null);

  const inner = useMemo(() => {
    const count = 500;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = [
      new THREE.Color('#7209B7'),
      new THREE.Color('#3A86FF'),
      new THREE.Color('#F72585'),
      new THREE.Color('#4CC9F0'),
      new THREE.Color('#480CA8'),
    ];
    for (let i = 0; i < count; i++) {
      const r = 14 + Math.random() * 12;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.4;
      pos[i * 3]     = r * Math.cos(theta) * Math.cos(phi);
      pos[i * 3 + 1] = r * Math.sin(phi) * 2.5;
      pos[i * 3 + 2] = r * Math.sin(theta) * Math.cos(phi);
      const c = palette[Math.floor(Math.random() * palette.length)];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    return { pos, col };
  }, []);

  const outer = useMemo(() => {
    const count = 350;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = [
      new THREE.Color('#560BAD'),
      new THREE.Color('#023E8A'),
      new THREE.Color('#B5179E'),
      new THREE.Color('#0096C7'),
    ];
    for (let i = 0; i < count; i++) {
      const r = 26 + Math.random() * 18;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.6;
      pos[i * 3]     = r * Math.cos(theta) * Math.cos(phi);
      pos[i * 3 + 1] = r * Math.sin(phi) * 4;
      pos[i * 3 + 2] = r * Math.sin(theta) * Math.cos(phi);
      const c = palette[Math.floor(Math.random() * palette.length)];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    return { pos, col };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (innerRef.current) innerRef.current.rotation.y = t * 0.016;
    if (outerRef.current) outerRef.current.rotation.y = -t * 0.009;
  });

  return (
    <>
      <points ref={innerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={500} array={inner.pos} itemSize={3} />
          <bufferAttribute attach="attributes-color"    count={500} array={inner.col} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.10} vertexColors transparent opacity={0.55} depthWrite={false} />
      </points>
      <points ref={outerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={350} array={outer.pos} itemSize={3} />
          <bufferAttribute attach="attributes-color"    count={350} array={outer.col} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.07} vertexColors transparent opacity={0.35} depthWrite={false} />
      </points>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Satellite orbit-path ring shown in system view
// ─────────────────────────────────────────────────────────────
function SatelliteOrbitRing({
  planetPos,
  radius,
  color,
}: {
  planetPos: THREE.Vector3;
  radius: number;
  color: string;
}) {
  return (
    <group position={planetPos}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.012, 8, 80]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Soft halo */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.09, 8, 80]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
// Scene — all 3D objects inside the canvas
// ─────────────────────────────────────────────────────────────
function Scene({
  viewMode,
  selectedCategory,
  lockedPlanetPosition,
  categories,
  onPlanetClick,
}: {
  viewMode: 'galaxy' | 'system';
  selectedCategory: string | null;
  lockedPlanetPosition: THREE.Vector3 | null;
  categories: Record<string, any[]>;
  onPlanetClick: (category: string, position: THREE.Vector3) => void;
}) {
  const { data: categoryNews = [] } = useQuery({
    queryKey: ['news-by-category', selectedCategory],
    queryFn: async () => {
      if (!selectedCategory) return [];
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .eq('category', selectedCategory)
        .order('published_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCategory && viewMode === 'system',
  });

  const ring1 = categoryNews.slice(0, Math.ceil(categoryNews.length / 2));
  const ring2 = categoryNews.slice(Math.ceil(categoryNews.length / 2));

  const planetTheme = selectedCategory
    ? CATEGORY_THEMES[selectedCategory as keyof typeof CATEGORY_THEMES]
    : null;

  return (
    <>
      <ambientLight intensity={0.10} />

      {/* Starfield */}
      <Stars radius={130} depth={70} count={7000} factor={4} saturation={0} fade speed={0.5} />

      {/* Nebula layers */}
      <NebulaCloud />

      {/* Ecliptic grid */}
      <EclipticGrid />

      {/* Sun */}
      <CentralSun />

      {/* ── GALAXY VIEW ── */}
      {viewMode === 'galaxy' && (
        <>
          {Object.entries(CATEGORY_THEMES).map(([cat, theme]) => (
            <OrbitalPath key={cat} radius={theme.orbitRadius} color={theme.primary} />
          ))}
          {Object.entries(categories).map(([category, news]) => (
            <CategoryPlanet
              key={category}
              category={category}
              newsCount={news.length}
              onClick={(pos) => onPlanetClick(category, pos)}
            />
          ))}
        </>
      )}

      {/* ── SYSTEM VIEW ── */}
      {viewMode === 'system' && selectedCategory && lockedPlanetPosition && (
        <>
          <CategoryPlanet
            key={`locked-${selectedCategory}`}
            category={selectedCategory}
            newsCount={categories[selectedCategory]?.length ?? 0}
            onClick={() => {}}
            isLocked
            lockedPosition={lockedPlanetPosition}
          />

          <SatelliteOrbitRing
            planetPos={lockedPlanetPosition}
            radius={3.5}
            color={planetTheme?.primary ?? '#4CC9F0'}
          />
          {ring2.length > 0 && (
            <SatelliteOrbitRing
              planetPos={lockedPlanetPosition}
              radius={5.5}
              color={planetTheme?.secondary ?? '#3A86FF'}
            />
          )}

          {ring1.map((news, i) => (
            <NewsSatellite
              key={news.id}
              news={news}
              index={i}
              total={ring1.length}
              planetPosition={lockedPlanetPosition}
              orbitRadius={3.5}
            />
          ))}
          {ring2.map((news, i) => (
            <NewsSatellite
              key={news.id}
              news={news}
              index={i}
              total={ring2.length}
              planetPosition={lockedPlanetPosition}
              orbitRadius={5.5}
            />
          ))}
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// System view news panel — readable card list
// ─────────────────────────────────────────────────────────────
function SystemNewsPanel({
  category,
  news,
  theme,
  onClose,
}: {
  category: string;
  news: any[];
  theme: CategoryTheme;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      className="absolute right-0 top-0 bottom-0 z-30 flex flex-col"
      style={{
        width: '360px',
        background: 'rgba(4, 6, 20, 0.92)',
        backdropFilter: 'blur(22px)',
        borderLeft: `1px solid ${theme.primary}35`,
        boxShadow: `-10px 0 50px ${theme.primary}14`,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{
          borderBottom: `1px solid ${theme.primary}28`,
          background: `linear-gradient(135deg, ${theme.primary}10 0%, transparent 100%)`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{
              backgroundColor: theme.primary,
              boxShadow: `0 0 10px ${theme.primary}`,
            }}
          />
          <div>
            <h3 className="font-bold text-sm text-white tracking-wide">{category}</h3>
            <p className="text-xs" style={{ color: `${theme.primary}bb` }}>
              {news.length} article{news.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-white/30 hover:text-white/80 hover:bg-white/8 transition-all"
          title="Retour à la galaxie"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* News list */}
      <div className="flex-1 overflow-y-auto">
        {news.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-white/30 text-sm">
            Aucune actualité dans cette catégorie
          </div>
        ) : (
          news.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.28 }}
              onClick={() => navigate(`/news/${item.id}`)}
              className="flex gap-3 p-3 cursor-pointer transition-colors group"
              style={{
                borderBottom: `1px solid ${theme.primary}12`,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              {/* Thumbnail */}
              {item.image_url ? (
                <div className="w-16 h-12 rounded-md overflow-hidden flex-shrink-0 bg-white/5">
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div
                  className="w-16 h-12 rounded-md flex-shrink-0 flex items-center justify-center text-xs"
                  style={{ background: `${theme.primary}18`, color: `${theme.primary}77` }}
                >
                  {category.slice(0, 2).toUpperCase()}
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium leading-tight line-clamp-2 mb-1 transition-colors"
                  style={{ color: 'rgba(255,255,255,0.88)' }}
                >
                  {item.title}
                </p>
                <div className="flex items-center gap-3 text-xs text-white/35">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {item.view_count ?? 0}
                  </span>
                  <span>{formatNewsDate(item.published_at)}</span>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main GalacticMap export
// ─────────────────────────────────────────────────────────────
export default function GalacticMap() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [viewMode, setViewMode] = useState<'galaxy' | 'system'>('galaxy');
  const [displayMode, setDisplayMode] = useState<'2d' | '3d'>('3d');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [lockedPlanetPosition, setLockedPlanetPosition] = useState<THREE.Vector3 | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showNavPanel, setShowNavPanel] = useState(!isMobile);
  const [showMiniMap, setShowMiniMap] = useState(!isMobile);
  const [cameraPosition, setCameraPosition] = useState(GALAXY_VIEW_POSITION);
  const [cameraRotation, setCameraRotation] = useState(new THREE.Euler());
  const [cameraTarget, setCameraTarget] = useState({
    position: GALAXY_VIEW_POSITION,
    lookAt: GALAXY_VIEW_TARGET,
  });

  const [filters, setFilters] = useState<NewsFilterOptions>({
    categories: [],
    dateRange: 'all',
    sortBy: 'recent',
    tags: [],
    searchQuery: '',
  });

  // Real-time news subscription
  useEffect(() => {
    const channel = supabase
      .channel('news-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'news' }, () => {
        queryClient.invalidateQueries({ queryKey: ['news-categories'] });
        if (selectedCategory) {
          queryClient.invalidateQueries({ queryKey: ['news-by-category', selectedCategory] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, selectedCategory]);

  const { data: categories = {}, isLoading } = useQuery({
    queryKey: ['news-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news')
        .select('category, id, published_at')
        .order('published_at', { ascending: false });
      if (error) throw error;

      const grouped = data.reduce((acc: Record<string, any[]>, news) => {
        if (!acc[news.category]) acc[news.category] = [];
        acc[news.category].push(news);
        return acc;
      }, {});

      ['Update', 'Feature', 'New Ships', 'Server Status'].forEach((cat) => {
        if (!grouped[cat]) grouped[cat] = [];
      });
      return grouped;
    },
  });

  const { data: allNews = [] } = useQuery({
    queryKey: ['all-news'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('published_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: categoryNews = [] } = useQuery({
    queryKey: ['news-by-category', selectedCategory],
    queryFn: async () => {
      if (!selectedCategory) return [];
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .eq('category', selectedCategory)
        .order('published_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCategory,
  });

  const filteredNews = useNewsFilters(allNews, filters);
  const availableTags = Array.from(
    new Set(allNews.flatMap((n) => n.tags ?? []).filter(Boolean))
  );

  const handleCameraUpdate = (position: THREE.Vector3, rotation: THREE.Euler) => {
    setCameraPosition(position.clone());
    setCameraRotation(rotation.clone());
  };

  const handlePlanetClick = (category: string, currentPosition: THREE.Vector3) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setSelectedCategory(category);
    setLockedPlanetPosition(currentPosition.clone());
    const sv = getSystemViewForPosition(currentPosition);
    setCameraTarget(sv);
  };

  const handleReturnToGalaxy = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setSelectedCategory(null);
    setLockedPlanetPosition(null);
    setCameraTarget({ position: GALAXY_VIEW_POSITION, lookAt: GALAXY_VIEW_TARGET });
  };

  const handleTransitionComplete = () => {
    setIsTransitioning(false);
    setViewMode(selectedCategory ? 'system' : 'galaxy');
  };

  const categoryCounts = Object.entries(categories).reduce(
    (acc: Record<string, number>, [cat, news]) => {
      acc[cat] = news.length;
      return acc;
    },
    {}
  );

  const selectedTheme = selectedCategory
    ? CATEGORY_THEMES[selectedCategory as keyof typeof CATEGORY_THEMES]
    : null;

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Top controls */}
      <div className="absolute top-4 left-4 right-4 z-40 flex gap-3 flex-wrap items-center">
        <Button
          variant={displayMode === '3d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDisplayMode('3d')}
          className="gap-2"
        >
          <Globe className="h-4 w-4" />
          Vue Galaxie
        </Button>
        <Button
          variant={displayMode === '2d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDisplayMode('2d')}
          className="gap-2"
        >
          <Grid3x3 className="h-4 w-4" />
          Vue 2D
        </Button>

        {displayMode === '3d' && viewMode === 'system' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReturnToGalaxy}
            className="gap-2 ml-2"
            disabled={isTransitioning}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la galaxie
          </Button>
        )}

        {displayMode === '3d' && viewMode === 'system' && selectedCategory && selectedTheme && (
          <div
            className="text-sm font-semibold px-3 py-1 rounded-full border"
            style={{
              color: selectedTheme.primary,
              borderColor: selectedTheme.primary,
              backgroundColor: `${selectedTheme.primary}18`,
            }}
          >
            {selectedCategory} · {categories[selectedCategory]?.length ?? 0} news
          </div>
        )}
      </div>

      {/* ── 3D MODE ── */}
      {displayMode === '3d' && (
        <>
          <Canvas
            camera={{ position: GALAXY_VIEW_POSITION.toArray() as [number, number, number], fov: 52 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          >
            <CameraController
              targetPosition={cameraTarget.position}
              targetLookAt={cameraTarget.lookAt}
              isTransitioning={isTransitioning}
              onTransitionComplete={handleTransitionComplete}
              onCameraUpdate={handleCameraUpdate}
            />

            <OrbitControls
              enablePan
              enableZoom
              enableRotate
              enabled={!isTransitioning}
              autoRotate={viewMode === 'galaxy' && !isTransitioning}
              autoRotateSpeed={0.04}
              minDistance={isMobile ? 6 : 4}
              maxDistance={isMobile ? 55 : 72}
              enableDamping
              dampingFactor={0.05}
            />

            <Scene
              viewMode={viewMode}
              selectedCategory={selectedCategory}
              lockedPlanetPosition={lockedPlanetPosition}
              categories={categories}
              onPlanetClick={handlePlanetClick}
            />
          </Canvas>

          {/* System view news panel */}
          <AnimatePresence>
            {viewMode === 'system' && selectedCategory && selectedTheme && (
              <SystemNewsPanel
                category={selectedCategory}
                news={categoryNews}
                theme={selectedTheme}
                onClose={handleReturnToGalaxy}
              />
            )}
          </AnimatePresence>

          <NavigationPanel
            viewMode={viewMode}
            selectedCategory={selectedCategory}
            categories={categoryCounts}
            onReturnToGalaxy={handleReturnToGalaxy}
            onCategorySelect={(cat) => {
              const theme = CATEGORY_THEMES[cat as keyof typeof CATEGORY_THEMES];
              if (theme) {
                const fallbackPos = new THREE.Vector3(
                  Math.cos(theme.orbitOffset) * theme.orbitRadius,
                  0,
                  Math.sin(theme.orbitOffset) * theme.orbitRadius
                );
                handlePlanetClick(cat, fallbackPos);
              }
            }}
            isVisible={showNavPanel}
            onToggle={() => setShowNavPanel(!showNavPanel)}
            isMobile={isMobile}
          />

          <MiniMap
            viewMode={viewMode}
            selectedCategory={selectedCategory}
            categories={categories}
            categoryNews={categoryNews}
            cameraPosition={cameraPosition}
            cameraRotation={cameraRotation}
            isVisible={showMiniMap}
            onToggle={() => setShowMiniMap(!showMiniMap)}
            isMobile={isMobile}
          />

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-xs text-white/35 pointer-events-none select-none">
            {viewMode === 'galaxy'
              ? 'Cliquer sur une planète · Scroll pour zoomer · Clic-droit pour pivoter'
              : 'Les news orbitent autour de la planète · Clic sur un satellite pour lire'}
          </div>
        </>
      )}

      {/* ── 2D MODE ── */}
      {displayMode === '2d' && (
        <div className="h-full overflow-auto">
          {/* Filters — visible below the top controls bar */}
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border/40 px-6 pt-16 pb-3">
            <NewsFilters
              categories={Object.keys(categories)}
              availableTags={availableTags}
              filters={filters}
              onFiltersChange={setFilters}
            />
          </div>

          {/* News content — full width */}
          <div className="px-6 py-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">Actualités Star Citizen</h2>
              <p className="text-sm text-muted-foreground">
                {filteredNews.length} news trouvée{filteredNews.length > 1 ? 's' : ''}
              </p>
            </div>
            <NewsGrid2D news={filteredNews} isLoading={isLoading} />
          </div>
        </div>
      )}
    </div>
  );
}
