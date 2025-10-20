import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF, Environment } from '@react-three/drei';
import { Skeleton } from './ui/skeleton';

interface ShipViewer3DProps {
  modelUrl: string;
  shipName: string;
}

function ShipModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} scale={1} />;
}

function LoadingFallback() {
  return (
    <div className="w-full h-[500px] flex items-center justify-center bg-background/50">
      <div className="text-center space-y-4">
        <Skeleton className="h-12 w-12 mx-auto rounded-full" />
        <p className="text-muted-foreground">Loading 3D model...</p>
      </div>
    </div>
  );
}

export function ShipViewer3D({ modelUrl, shipName }: ShipViewer3DProps) {
  return (
    <div className="w-full h-[500px] relative">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <directionalLight position={[-10, -10, -5]} intensity={0.5} />
        <Environment preset="sunset" />
        
        <Suspense fallback={null}>
          <ShipModel url={modelUrl} />
        </Suspense>
        
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          autoRotate={true}
          autoRotateSpeed={0.5}
          minDistance={2}
          maxDistance={20}
        />
      </Canvas>
      
      <div className="absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-primary/20">
        <p className="text-sm text-muted-foreground">
          Drag to rotate • Scroll to zoom
        </p>
      </div>
    </div>
  );
}
