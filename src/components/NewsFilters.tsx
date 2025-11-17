import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Calendar, TrendingUp, Tag, X, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface NewsFilterOptions {
  categories: string[];
  dateRange: 'all' | 'today' | 'week' | 'month' | 'year';
  sortBy: 'recent' | 'popular' | 'trending';
  tags: string[];
  searchQuery: string;
}

interface NewsFiltersProps {
  categories: string[];
  availableTags: string[];
  filters: NewsFilterOptions;
  onFiltersChange: (filters: NewsFilterOptions) => void;
  compact?: boolean;
}

export default function NewsFilters({
  categories,
  availableTags,
  filters,
  onFiltersChange,
  compact = false,
}: NewsFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [tagInput, setTagInput] = useState('');

  const handleCategoryToggle = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter(c => c !== category)
      : [...filters.categories, category];
    onFiltersChange({ ...filters, categories: newCategories });
  };

  const handleTagAdd = (tag: string) => {
    if (tag && !filters.tags.includes(tag)) {
      onFiltersChange({ ...filters, tags: [...filters.tags, tag] });
      setTagInput('');
    }
  };

  const handleTagRemove = (tag: string) => {
    onFiltersChange({ ...filters, tags: filters.tags.filter(t => t !== tag) });
  };

  const handleReset = () => {
    onFiltersChange({
      categories: [],
      dateRange: 'all',
      sortBy: 'recent',
      tags: [],
      searchQuery: '',
    });
  };

  const activeFiltersCount = 
    filters.categories.length + 
    filters.tags.length + 
    (filters.dateRange !== 'all' ? 1 : 0) +
    (filters.sortBy !== 'recent' ? 1 : 0) +
    (filters.searchQuery ? 1 : 0);

  return (
    <Card className="bg-card/95 backdrop-blur border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Filtres</CardTitle>
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFiltersCount}
              </Badge>
            )}
          </div>
          {compact && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Réduire' : 'Étendre'}
            </Button>
          )}
        </div>
      </CardHeader>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Recherche</label>
                <Input
                  placeholder="Rechercher dans les news..."
                  value={filters.searchQuery}
                  onChange={(e) => onFiltersChange({ ...filters, searchQuery: e.target.value })}
                  className="bg-background/50"
                />
              </div>

              {/* Categories */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Catégories
                </label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <Badge
                      key={category}
                      variant={filters.categories.includes(category) ? 'default' : 'outline'}
                      className="cursor-pointer hover:scale-105 transition-transform"
                      onClick={() => handleCategoryToggle(category)}
                    >
                      {category}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Période
                </label>
                <Select
                  value={filters.dateRange}
                  onValueChange={(value: any) => onFiltersChange({ ...filters, dateRange: value })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les dates</SelectItem>
                    <SelectItem value="today">Aujourd'hui</SelectItem>
                    <SelectItem value="week">Cette semaine</SelectItem>
                    <SelectItem value="month">Ce mois</SelectItem>
                    <SelectItem value="year">Cette année</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort By */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Trier par
                </label>
                <Select
                  value={filters.sortBy}
                  onValueChange={(value: any) => onFiltersChange({ ...filters, sortBy: value })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Plus récentes</SelectItem>
                    <SelectItem value="popular">Plus populaires</SelectItem>
                    <SelectItem value="trending">Tendances</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tags */}
              {availableTags.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tags</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ajouter un tag..."
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleTagAdd(tagInput);
                        }
                      }}
                      className="bg-background/50"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleTagAdd(tagInput)}
                      disabled={!tagInput}
                    >
                      Ajouter
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {filters.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="cursor-pointer group"
                      >
                        {tag}
                        <X
                          className="h-3 w-3 ml-1 opacity-60 group-hover:opacity-100"
                          onClick={() => handleTagRemove(tag)}
                        />
                      </Badge>
                    ))}
                  </div>
                  {availableTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-xs text-muted-foreground">Suggestions:</span>
                      {availableTags
                        .filter(tag => !filters.tags.includes(tag))
                        .slice(0, 5)
                        .map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="cursor-pointer hover:bg-primary/10"
                            onClick={() => handleTagAdd(tag)}
                          >
                            {tag}
                          </Badge>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Reset Button */}
              {activeFiltersCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="w-full"
                >
                  Réinitialiser les filtres
                </Button>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
