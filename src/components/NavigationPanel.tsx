import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Map } from 'lucide-react';

interface NavigationPanelProps {
  viewMode: 'galaxy' | 'system';
  selectedCategory: string | null;
  categories: Record<string, number>;
  onReturnToGalaxy: () => void;
  onCategorySelect: (category: string) => void;
}

export default function NavigationPanel({
  viewMode,
  selectedCategory,
  categories,
  onReturnToGalaxy,
  onCategorySelect,
}: NavigationPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="fixed top-4 left-4 z-10 w-80"
    >
      <Card className="bg-background/80 backdrop-blur border-primary/30">
        <CardContent className="p-4 space-y-4">
          {/* Mode indicator */}
          <div className="flex items-center gap-2">
            <Map className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {viewMode === 'galaxy' ? 'Galactic View' : `System View`}
              </p>
              {selectedCategory && (
                <p className="text-xs text-muted-foreground">{selectedCategory}</p>
              )}
            </div>
          </div>

          {/* Return button */}
          <AnimatePresence>
            {viewMode === 'system' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onReturnToGalaxy}
                  className="w-full"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Return to Galaxy
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Categories list */}
          {viewMode === 'galaxy' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Categories
              </p>
              {Object.entries(categories).map(([category, count]) => (
                <button
                  key={category}
                  onClick={() => onCategorySelect(category)}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-primary/10 transition-colors"
                >
                  <span className="text-sm text-foreground">{category}</span>
                  <Badge variant="secondary" className="text-xs">
                    {count}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {/* Instructions */}
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              {viewMode === 'galaxy'
                ? 'Click on a planet to explore • Drag to rotate • Scroll to zoom'
                : 'Click on a satellite to read • Drag to navigate'}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
