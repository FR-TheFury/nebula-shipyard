import { useMemo } from 'react';
import { NewsFilterOptions } from '@/components/NewsFilters';

interface News {
  id: number;
  title: string;
  excerpt: string | null;
  category: string;
  published_at: string;
  image_url: string | null;
  view_count: number | null;
  reaction_counts?: any;
  tags?: string[];
}

export function useNewsFilters(news: News[], filters: NewsFilterOptions) {
  return useMemo(() => {
    let filtered = [...news];

    // Filter by categories
    if (filters.categories.length > 0) {
      filtered = filtered.filter(item => filters.categories.includes(item.category));
    }

    // Filter by search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        item =>
          item.title.toLowerCase().includes(query) ||
          item.excerpt?.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query)
      );
    }

    // Filter by tags
    if (filters.tags.length > 0) {
      filtered = filtered.filter(item => {
        if (!item.tags || item.tags.length === 0) return false;
        return filters.tags.some(tag => item.tags?.includes(tag));
      });
    }

    // Filter by date range
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const ranges = {
        today: new Date(now.setHours(0, 0, 0, 0)),
        week: new Date(now.setDate(now.getDate() - 7)),
        month: new Date(now.setMonth(now.getMonth() - 1)),
        year: new Date(now.setFullYear(now.getFullYear() - 1)),
      };

      const startDate = ranges[filters.dateRange as keyof typeof ranges];
      if (startDate) {
        filtered = filtered.filter(
          item => new Date(item.published_at) >= startDate
        );
      }
    }

    // Sort
    switch (filters.sortBy) {
      case 'recent':
        filtered.sort(
          (a, b) =>
            new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
        );
        break;

      case 'popular':
        filtered.sort(
          (a, b) => (b.view_count || 0) - (a.view_count || 0)
        );
        break;

      case 'trending':
        // Calculate trending score (views + reactions * 2)
        filtered.sort((a, b) => {
          const scoreA =
            (a.view_count || 0) +
            (getTotalReactions(a.reaction_counts) * 2);
          const scoreB =
            (b.view_count || 0) +
            (getTotalReactions(b.reaction_counts) * 2);
          return scoreB - scoreA;
        });
        break;
    }

    return filtered;
  }, [news, filters]);
}

function getTotalReactions(reactionCounts: any): number {
  if (!reactionCounts) return 0;
  return (
    (reactionCounts.like || 0) +
    (reactionCounts.important || 0) +
    (reactionCounts.interesting || 0)
  );
}
