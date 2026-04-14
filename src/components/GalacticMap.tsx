import { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Stars, OrbitControls } from '@react-three/drei';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import * as THREE from 'three';
import CategoryPlanet from './CategoryPlanet';
import NewsSatellite from './NewsSatellite';
import NavigationPanel from './NavigationPanel';
import MiniMap from './MiniMap';
import NewsFilters, { NewsFilterOptions } from './NewsFilters';
import NewsGrid2D from './NewsGrid2D';
import { useNewsFilters } from '@/hooks/useNewsFilters';
import { Button } from './ui/button';
import { Grid3x3, Globe, ArrowLeft } from 'lucide-react';
import {
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
      // compute current lookAt from camera direction
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
// Central Sun
// ─────────────────────────────────────────────────────────────
function CentralSun() {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(() => ({ time: { value: 0 } }), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    uniforms.time.value = t;
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.15;
    }
    if (glowRef.current) {
      const s = 1.6 + Math.sin(t * 0.8) * 0.06;
      glowRef.current.scale.setScalar(s);
    }
  });

  return (
    <group>
      {/* Core */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.4, 64, 64]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={sunVertexShader}
          fragmentShader={sunFragmentShader}
          uniforms={uniforms}
        />
      </mesh>

      {/* Halo glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.4, 32, 32]} />
        <meshBasicMaterial
          color="#FF8C00"
          transparent
          opacity={0.08}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Lights */}
      <pointLight intensity={6} distance={40} color="#FF8C42" />
      <pointLight intensity={3} distance={25} color="#F72585" position={[0, 1, 0]} />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
// Orbit path ring (guide)
// ─────────────────────────────────────────────────────────────
function OrbitalPath({ radius, color }: { radius: number; color: string }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.015, 8, 160]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.12}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────
// Nebula / ambient particle cloud
// ─────────────────────────────────────────────────────────────
function NebulaCloud() {
  const ref = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const count = 600;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = [
      new THREE.Color('#7209B7'),
      new THREE.Color('#3A86FF'),
      new THREE.Color('#F72585'),
      new THREE.Color('#4CC9F0'),
    ];

    for (let i = 0; i < count; i++) {
      const r = 22 + Math.random() * 14;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.5;

      pos[i * 3] = r * Math.cos(theta) * Math.cos(phi);
      pos[i * 3 + 1] = r * Math.sin(phi) * 3;
      pos[i * 3 + 2] = r * Math.sin(theta) * Math.cos(phi);

      const c = palette[Math.floor(Math.random() * palette.length)];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { positions: pos, colors: col };
  }, []);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.018;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={600} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={600} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.08} vertexColors transparent opacity={0.45} depthWrite={false} />
    </points>
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
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
// Scene — contains everything in the canvas
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

  // Distribute satellites into 2 orbit rings
  const ring1 = categoryNews.slice(0, Math.ceil(categoryNews.length / 2));
  const ring2 = categoryNews.slice(Math.ceil(categoryNews.length / 2));

  const planetTheme = selectedCategory
    ? CATEGORY_THEMES[selectedCategory as keyof typeof CATEGORY_THEMES]
    : null;

  return (
    <>
      <ambientLight intensity={0.08} />

      {/* Starfield */}
      <Stars radius={120} depth={60} count={6000} factor={4} saturation={0} fade speed={0.6} />

      {/* Nebula */}
      <NebulaCloud />

      {/* Sun */}
      <CentralSun />

      {/* ── GALAXY VIEW ── */}
      {viewMode === 'galaxy' && (
        <>
          {/* Orbital path guides */}
          {Object.entries(CATEGORY_THEMES).map(([cat, theme]) => (
            <OrbitalPath key={cat} radius={theme.orbitRadius} color={theme.primary} />
          ))}

          {/* Planets */}
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
          {/* The selected planet, frozen at locked position */}
          <CategoryPlanet
            key={`locked-${selectedCategory}`}
            category={selectedCategory}
            newsCount={categories[selectedCategory]?.length ?? 0}
            onClick={() => {}}
            isLocked
            lockedPosition={lockedPlanetPosition}
          />

          {/* Satellite orbit-path rings */}
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

          {/* Ring 1 — inner orbit */}
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

          {/* Ring 2 — outer orbit */}
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

  // Fetch categories
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

      // Ensure all defined categories present even if empty
      ['Update', 'Feature', 'New Ships', 'Server Status'].forEach((cat) => {
        if (!grouped[cat]) grouped[cat] = [];
      });
      return grouped;
    },
  });

  // Fetch all news for 2D mode
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

  // Fetch news for selected category (for MiniMap)
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

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Top controls bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex gap-3 flex-wrap items-center">
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

        {/* Return button in system view */}
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

        {/* System view: show selected category name */}
        {displayMode === '3d' && viewMode === 'system' && selectedCategory && (
          <div
            className="text-sm font-semibold px-3 py-1 rounded-full border"
            style={{
              color: CATEGORY_THEMES[selectedCategory as keyof typeof CATEGORY_THEMES]?.primary ?? '#fff',
              borderColor:
                CATEGORY_THEMES[selectedCategory as keyof typeof CATEGORY_THEMES]?.primary ??
                '#fff',
              backgroundColor: `${
                CATEGORY_THEMES[selectedCategory as keyof typeof CATEGORY_THEMES]?.primary ?? '#fff'
              }18`,
            }}
          >
            {selectedCategory} · {categories[selectedCategory]?.length ?? 0} news
          </div>
        )}

        {displayMode === '2d' && (
          <div className="flex-1 max-w-md">
            <NewsFilters
              categories={Object.keys(categories)}
              availableTags={availableTags}
              filters={filters}
              onFiltersChange={setFilters}
              compact
            />
          </div>
        )}
      </div>

      {/* ── 3D MODE ── */}
      {displayMode === '3d' && (
        <>
          <Canvas
            camera={{ position: GALAXY_VIEW_POSITION.toArray() as [number, number, number], fov: 55 }}
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
              autoRotateSpeed={0.2}
              minDistance={isMobile ? 6 : 4}
              maxDistance={isMobile ? 55 : 70}
              enableDamping
              dampingFactor={0.06}
            />

            <Scene
              viewMode={viewMode}
              selectedCategory={selectedCategory}
              lockedPlanetPosition={lockedPlanetPosition}
              categories={categories}
              onPlanetClick={handlePlanetClick}
            />
          </Canvas>

          <NavigationPanel
            viewMode={viewMode}
            selectedCategory={selectedCategory}
            categories={categoryCounts}
            onReturnToGalaxy={handleReturnToGalaxy}
            onCategorySelect={(cat) => {
              // When clicking from nav panel in galaxy view, we need a position
              // Use initial orbit position as fallback
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

          {/* Hint text */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-xs text-white/40 pointer-events-none select-none">
            {viewMode === 'galaxy'
              ? 'Cliquer sur une planète • Scroll pour zoomer • Clic-droit pour pivoter'
              : 'Les news orbitent autour de la planète • Clic pour lire'}
          </div>
        </>
      )}

      {/* ── 2D MODE ── */}
      {displayMode === '2d' && (
        <div className="h-full overflow-auto pt-20 px-4 pb-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="sticky top-20 z-10 bg-background/95 backdrop-blur pb-4">
              <NewsFilters
                categories={Object.keys(categories)}
                availableTags={availableTags}
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Actualités Star Citizen</h2>
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
