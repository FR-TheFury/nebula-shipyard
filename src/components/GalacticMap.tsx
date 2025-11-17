import { useState, useRef, useEffect } from 'react';
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
import { Grid3x3, Globe } from 'lucide-react';
import {
  getPlanetPosition,
  getSystemViewPosition,
  GALAXY_VIEW_POSITION,
  GALAXY_VIEW_TARGET,
  lerpVector3,
  easeInOutCubic,
} from '@/utils/galacticMap';
import { Skeleton } from './ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';

interface CameraControllerProps {
  targetPosition: THREE.Vector3;
  targetLookAt: THREE.Vector3;
  isTransitioning: boolean;
  onTransitionComplete: () => void;
  onCameraUpdate?: (position: THREE.Vector3, rotation: THREE.Euler) => void;
}

function CameraController({ targetPosition, targetLookAt, isTransitioning, onTransitionComplete, onCameraUpdate }: CameraControllerProps) {
  const { camera } = useThree();
  const startPosition = useRef(new THREE.Vector3());
  const startLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const progress = useRef(0);
  const duration = 2000; // 2 seconds

  useEffect(() => {
    if (isTransitioning) {
      startPosition.current.copy(camera.position);
      startLookAt.current.copy(new THREE.Vector3(0, 0, 0));
      progress.current = 0;

      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const easedT = easeInOutCubic(t);

        camera.position.copy(lerpVector3(startPosition.current, targetPosition, easedT));
        camera.lookAt(lerpVector3(startLookAt.current, targetLookAt, easedT));

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          onTransitionComplete();
        }
      };

      animate();
    }
  }, [isTransitioning, targetPosition, targetLookAt, camera, onTransitionComplete]);

  // Update camera position on every frame for MiniMap
  useFrame(() => {
    if (onCameraUpdate) {
      onCameraUpdate(camera.position, camera.rotation);
    }
  });

  return null;
}

function Scene({
  viewMode,
  selectedCategory,
  categories,
  onPlanetClick,
}: {
  viewMode: 'galaxy' | 'system';
  selectedCategory: string | null;
  categories: Record<string, any[]>;
  onPlanetClick: (category: string) => void;
}) {
  // Fetch news for selected category
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
    enabled: !!selectedCategory && viewMode === 'system',
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.1} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />

      {/* Background */}
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

      {/* Galaxy View: Show all category planets */}
      {viewMode === 'galaxy' &&
        Object.entries(categories).map(([category, news]) => (
          <CategoryPlanet
            key={category}
            category={category}
            position={getPlanetPosition(category)}
            newsCount={news.length}
            onClick={() => onPlanetClick(category)}
          />
        ))}

      {/* System View: Show selected planet + satellites */}
      {viewMode === 'system' && selectedCategory && (
        <>
          <CategoryPlanet
            category={selectedCategory}
            position={getPlanetPosition(selectedCategory)}
            newsCount={categories[selectedCategory]?.length || 0}
            onClick={() => {}}
          />

          {categoryNews.map((news, index) => (
            <NewsSatellite
              key={news.id}
              news={news}
              index={index}
              total={categoryNews.length}
              planetPosition={getPlanetPosition(selectedCategory)}
              orbitRadius={3 + Math.floor(index / 3) * 1.5}
            />
          ))}
        </>
      )}
    </>
  );
}

export default function GalacticMap() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'galaxy' | 'system'>('galaxy');
  const [displayMode, setDisplayMode] = useState<'2d' | '3d'>('3d');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showNavPanel, setShowNavPanel] = useState(!isMobile);
  const [showMiniMap, setShowMiniMap] = useState(!isMobile);
  const [cameraPosition, setCameraPosition] = useState(GALAXY_VIEW_POSITION);
  const [cameraRotation, setCameraRotation] = useState(new THREE.Euler());
  const [cameraTarget, setCameraTarget] = useState({
    position: GALAXY_VIEW_POSITION,
    lookAt: GALAXY_VIEW_TARGET,
  });

  // Filters state
  const [filters, setFilters] = useState<NewsFilterOptions>({
    categories: [],
    dateRange: 'all',
    sortBy: 'recent',
    tags: [],
    searchQuery: '',
  });

  // Real-time subscription for news updates
  useEffect(() => {
    const channel = supabase
      .channel('news-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'news'
        },
        () => {
          // Invalidate queries to refetch data
          queryClient.invalidateQueries({ queryKey: ['news-categories'] });
          if (selectedCategory) {
            queryClient.invalidateQueries({ queryKey: ['news-by-category', selectedCategory] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, selectedCategory]);

  // Fetch categories with news count
  const { data: categories = {}, isLoading } = useQuery({
    queryKey: ['news-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news')
        .select('category, id, published_at')
        .order('published_at', { ascending: false });

      if (error) throw error;

      const grouped = data.reduce((acc, news) => {
        if (!acc[news.category]) acc[news.category] = [];
        acc[news.category].push(news);
        return acc;
      }, {} as Record<string, any[]>);

      // Ensure all defined planets are present, even without news
      const allCategories = ['Update', 'Feature', 'New Ships', 'Server Status'];
      allCategories.forEach(cat => {
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

  // Fetch news for selected category for MiniMap
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

  // Apply filters
  const filteredNews = useNewsFilters(allNews, filters);

  // Get all unique tags from news
  const availableTags = Array.from(
    new Set(
      allNews
        .flatMap(news => news.tags || [])
        .filter(Boolean)
    )
  );

  const handleCameraUpdate = (position: THREE.Vector3, rotation: THREE.Euler) => {
    setCameraPosition(position.clone());
    setCameraRotation(rotation.clone());
  };

  const handlePlanetClick = (category: string) => {
    if (isTransitioning) return;

    setIsTransitioning(true);
    setSelectedCategory(category);

    const systemView = getSystemViewPosition(category);
    setCameraTarget(systemView);
  };

  const handleReturnToGalaxy = () => {
    if (isTransitioning) return;

    setIsTransitioning(true);
    setSelectedCategory(null);
    setCameraTarget({
      position: GALAXY_VIEW_POSITION,
      lookAt: GALAXY_VIEW_TARGET,
    });
  };

  const handleTransitionComplete = () => {
    setIsTransitioning(false);
    if (selectedCategory) {
      setViewMode('system');
    } else {
      setViewMode('galaxy');
    }
  };

  const categoryCounts = Object.entries(categories).reduce((acc, [cat, news]) => {
    acc[cat] = news.length;
    return acc;
  }, {} as Record<string, number>);

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  if (Object.keys(categories).length === 0) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <p className="text-muted-foreground">No news available</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Mode Toggle and Filters Bar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex gap-4 flex-wrap">
        <Button
          variant={displayMode === '3d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDisplayMode('3d')}
          className="gap-2"
        >
          <Globe className="h-4 w-4" />
          Vue 3D
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

      {/* 3D Mode */}
      {displayMode === '3d' && (
        <>
          <Canvas camera={{ position: [0, 8, 20], fov: 60 }}>
            <CameraController
              targetPosition={cameraTarget.position}
              targetLookAt={cameraTarget.lookAt}
              isTransitioning={isTransitioning}
              onTransitionComplete={handleTransitionComplete}
              onCameraUpdate={handleCameraUpdate}
            />

            <OrbitControls
              enablePan={true}
              enableZoom={true}
              enableRotate={true}
              autoRotate={false}
              minDistance={isMobile ? 5 : 3}
              maxDistance={isMobile ? 40 : 50}
              enableDamping={true}
              dampingFactor={0.05}
            />

            <Scene
              viewMode={viewMode}
              selectedCategory={selectedCategory}
              categories={categories}
              onPlanetClick={handlePlanetClick}
            />
          </Canvas>

          <NavigationPanel
            viewMode={viewMode}
            selectedCategory={selectedCategory}
            categories={categoryCounts}
            onReturnToGalaxy={handleReturnToGalaxy}
            onCategorySelect={handlePlanetClick}
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
        </>
      )}

      {/* 2D Mode */}
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
              <h2 className="text-2xl font-bold">
                Actualités Star Citizen
              </h2>
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
