import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PLANET_POSITIONS, CATEGORY_THEMES } from '@/utils/galacticMap';

interface MiniMapProps {
  viewMode: 'galaxy' | 'system';
  selectedCategory: string | null;
}

export default function MiniMap({ viewMode, selectedCategory }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    for (let i = 0; i <= 150; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 150);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(150, i);
      ctx.stroke();
    }

    // Center point
    const centerX = 75;
    const centerY = 75;
    const scale = 10;

    // Draw planets
    Object.entries(PLANET_POSITIONS).forEach(([category, position]) => {
      const theme = CATEGORY_THEMES[category as keyof typeof CATEGORY_THEMES];
      const x = centerX + position.x * scale;
      const y = centerY - position.z * scale;

      // Highlight selected category
      const isSelected = selectedCategory === category;

      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = theme?.primary || '#FFFFFF';
      ctx.fill();

      // Glow effect
      if (isSelected) {
        ctx.strokeStyle = theme?.glow || '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px monospace';
      ctx.fillText(category, x + 10, y + 5);
    });

    // Draw camera indicator (center)
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00D9FF';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [viewMode, selectedCategory]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute bottom-4 right-4 z-10"
    >
      <div className="bg-background/80 backdrop-blur border border-primary/30 rounded-lg p-2">
        <canvas
          ref={canvasRef}
          width={150}
          height={150}
          className="rounded"
        />
        <p className="text-xs text-center text-muted-foreground mt-1">Radar</p>
      </div>
    </motion.div>
  );
}
