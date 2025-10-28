import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLANET_POSITIONS, CATEGORY_THEMES, getSatelliteOrbitPosition } from '@/utils/galacticMap';
import { Button } from './ui/button';
import { Radar, X } from 'lucide-react';
import * as THREE from 'three';

interface MiniMapProps {
  viewMode: 'galaxy' | 'system';
  selectedCategory: string | null;
  categories: Record<string, any[]>;
  categoryNews: any[];
  cameraPosition: THREE.Vector3;
  cameraRotation: THREE.Euler;
  isVisible: boolean;
  onToggle: () => void;
  isMobile: boolean;
}

export default function MiniMap({ 
  viewMode, 
  selectedCategory, 
  categories,
  categoryNews,
  cameraPosition, 
  cameraRotation,
  isVisible, 
  onToggle, 
  isMobile 
}: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const size = isMobile ? 100 : 150;
  const gridStep = isMobile ? 25 : 30;

  useEffect(() => {
    if (!isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      ctx.strokeStyle = 'rgba(76, 201, 240, 0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= size; i += gridStep) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
      }

      // Center point
      const centerX = size / 2;
      const centerY = size / 2;
      const scale = isMobile ? 6 : 10;

      // Draw planets
      Object.entries(PLANET_POSITIONS).forEach(([category, position]) => {
        const theme = CATEGORY_THEMES[category as keyof typeof CATEGORY_THEMES];
        const x = centerX + position.x * scale;
        const y = centerY - position.z * scale;

        // Highlight selected category
        const isSelected = selectedCategory === category;

        // Draw orbit circle if selected
        if (isSelected && viewMode === 'system') {
          const orbitRadius = 3 * scale;
          ctx.beginPath();
          ctx.arc(x, y, orbitRadius, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(76, 201, 240, 0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Draw planet
        ctx.beginPath();
        ctx.arc(x, y, isSelected ? (isMobile ? 6 : 8) : (isMobile ? 3 : 5), 0, Math.PI * 2);
        ctx.fillStyle = theme?.primary || '#FFFFFF';
        ctx.fill();

        // Glow effect
        if (isSelected) {
          ctx.strokeStyle = theme?.glow || '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Label (skip on mobile)
        if (!isMobile) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '9px monospace';
          ctx.fillText(category, x + 10, y + 4);
        }
      });

      // Draw satellites in system view
      if (viewMode === 'system' && selectedCategory && categoryNews.length > 0) {
        const planetPos = PLANET_POSITIONS[selectedCategory as keyof typeof PLANET_POSITIONS];
        if (planetPos) {
          const planetX = centerX + planetPos.x * scale;
          const planetY = centerY - planetPos.z * scale;
          const time = Date.now() * 0.001;

          categoryNews.forEach((_, index) => {
            const orbitRadius = (3 + Math.floor(index / 3) * 1.5) * scale;
            const angleStep = (Math.PI * 2) / categoryNews.length;
            const angle = angleStep * index + time * 0.5;
            
            const satX = planetX + Math.cos(angle) * orbitRadius;
            const satY = planetY + Math.sin(angle) * orbitRadius;

            // Draw satellite
            ctx.beginPath();
            ctx.arc(satX, satY, isMobile ? 1.5 : 2, 0, Math.PI * 2);
            ctx.fillStyle = '#00D9FF';
            ctx.fill();
          });
        }
      }

      // Draw camera indicator with direction
      const camX = centerX + cameraPosition.x * scale * 0.5;
      const camY = centerY - cameraPosition.z * scale * 0.5;

      // Camera direction indicator (arrow)
      const dirLength = isMobile ? 8 : 12;
      const angle = -cameraRotation.y;
      const endX = camX + Math.cos(angle) * dirLength;
      const endY = camY + Math.sin(angle) * dirLength;

      // Draw line
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = '#00D9FF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw arrow head
      const arrowSize = isMobile ? 4 : 6;
      const angle1 = angle + Math.PI * 0.8;
      const angle2 = angle - Math.PI * 0.8;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX + Math.cos(angle1) * arrowSize, endY + Math.sin(angle1) * arrowSize);
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX + Math.cos(angle2) * arrowSize, endY + Math.sin(angle2) * arrowSize);
      ctx.strokeStyle = '#00D9FF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw camera position dot
      ctx.beginPath();
      ctx.arc(camX, camY, isMobile ? 2 : 3, 0, Math.PI * 2);
      ctx.fillStyle = '#00D9FF';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Continue animation
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [viewMode, selectedCategory, categories, categoryNews, cameraPosition, cameraRotation, size, gridStep, isMobile, isVisible]);

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-4 right-4 z-10"
          >
            <div className="bg-background/90 backdrop-blur border border-primary/30 rounded-lg p-2 relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
              >
                <X className="w-3 h-3" />
              </Button>
              <canvas
                ref={canvasRef}
                width={size}
                height={size}
                className="rounded"
              />
              <p className="text-xs text-center text-muted-foreground mt-1">Radar</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button when hidden */}
      <AnimatePresence>
        {!isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-4 right-4 z-10"
          >
            <Button
              onClick={onToggle}
              size="icon"
              className="h-10 w-10 rounded-full bg-background/90 backdrop-blur border border-primary/30 hover:bg-background"
            >
              <Radar className="w-5 h-5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
