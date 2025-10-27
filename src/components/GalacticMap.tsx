import { useState, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Stars, OrbitControls } from '@react-three/drei';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import * as THREE from 'three';
import CategoryPlanet from './CategoryPlanet';
import NewsSatellite from './NewsSatellite';
import NavigationPanel from './NavigationPanel';
import {
  getPlanetPosition,
  getSystemViewPosition,
  GALAXY_VIEW_POSITION,
  GALAXY_VIEW_TARGET,
  lerpVector3,
  easeInOutCubic,
} from '@/utils/galacticMap';
import { Skeleton } from './ui/skeleton';

interface CameraControllerProps {
  targetPosition: THREE.Vector3;
  targetLookAt: THREE.Vector3;
  isTransitioning: boolean;
  onTransitionComplete: () => void;
}

function CameraController({ targetPosition, targetLookAt, isTransitioning, onTransitionComplete }: CameraControllerProps) {
  const { camera, controls } = useThree();
  const startPosition = useRef(new THREE.Vector3());
  const startLookAt = useRef(new THREE.Vector3());
  const progress = useRef(0);
  const duration = 2000; // 2 seconds

  useEffect(() => {
    if (isTransitioning && controls) {
      startPosition.current.copy(camera.position);
      // @ts-ignore - OrbitControls has a target property
      startLookAt.current.copy(controls.target);
      progress.current = 0;

      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const easedT = easeInOutCubic(t);

        camera.position.copy(lerpVector3(startPosition.current, targetPosition, easedT));
        const newLookAt = lerpVector3(startLookAt.current, targetLookAt, easedT);
        // @ts-ignore - OrbitControls has a target property
        controls.target.copy(newLookAt);
        // @ts-ignore
        controls.update();

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          onTransitionComplete();
        }
      };

      animate();
    }
  }, [isTransitioning, targetPosition, targetLookAt, camera, controls, onTransitionComplete]);

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
  const [viewMode, setViewMode] = useState<'galaxy' | 'system'>('galaxy');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [cameraTarget, setCameraTarget] = useState({
    position: GALAXY_VIEW_POSITION,
    lookAt: GALAXY_VIEW_TARGET,
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

      return grouped;
    },
  });

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
      <div className="w-full h-[600px] flex items-center justify-center">
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  if (Object.keys(categories).length === 0) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center">
        <p className="text-muted-foreground">No news available</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[600px] overflow-hidden">
      <Canvas camera={{ position: [0, 8, 20], fov: 60 }}>
        <CameraController
          targetPosition={cameraTarget.position}
          targetLookAt={cameraTarget.lookAt}
          isTransitioning={isTransitioning}
          onTransitionComplete={handleTransitionComplete}
        />

        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          autoRotate={false}
          minDistance={3}
          maxDistance={50}
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
      />
    </div>
  );
}
