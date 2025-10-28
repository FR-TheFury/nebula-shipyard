import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLANET_POSITIONS, CATEGORY_THEMES } from '@/utils/galacticMap';
import { Button } from './ui/button';
import { Radar, X } from 'lucide-react';

interface MiniMapProps {
  viewMode: 'galaxy' | 'system';
  selectedCategory: string | null;
  isVisible: boolean;
  onToggle: () => void;
  isMobile: boolean;
}

export default function MiniMap({ viewMode, selectedCategory, isVisible, onToggle, isMobile }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = isMobile ? 100 : 150;
  const gridStep = isMobile ? 25 : 30;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
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

      // Label (skip on mobile if too small)
      if (!isMobile) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px monospace';
        ctx.fillText(category, x + 10, y + 5);
      }
    });

    // Draw camera indicator (center)
    ctx.beginPath();
    ctx.arc(centerX, centerY, isMobile ? 2 : 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00D9FF';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [viewMode, selectedCategory, size, gridStep, isMobile]);

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
