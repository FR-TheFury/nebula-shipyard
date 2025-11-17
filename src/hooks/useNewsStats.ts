import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface NewsStats {
  viewCount: number;
  reactions: {
    like: number;
    important: number;
    interesting: number;
  };
  commentCount: number;
  trendingScore: number;
}

export function useNewsStats(newsId: number) {
  return useQuery({
    queryKey: ["news-stats", newsId],
    queryFn: async (): Promise<NewsStats> => {
      // Fetch news with stats
      const { data: news, error: newsError } = await supabase
        .from("news")
        .select("view_count, reaction_counts")
        .eq("id", newsId)
        .single();

      if (newsError) throw newsError;

      // Fetch comment count
      const { count: commentCount, error: commentError } = await supabase
        .from("news_comments")
        .select("*", { count: "exact", head: true })
        .eq("news_id", newsId);

      if (commentError) throw commentError;

      // Parse reaction_counts from Json
      const reactionCounts = (news.reaction_counts as any) || { like: 0, important: 0, interesting: 0 };

      // Calculate trending score (views * 0.1 + total reactions * 2 + comments * 5)
      const totalReactions =
        (reactionCounts.like || 0) +
        (reactionCounts.important || 0) +
        (reactionCounts.interesting || 0);

      const trendingScore =
        (news.view_count || 0) * 0.1 +
        totalReactions * 2 +
        (commentCount || 0) * 5;

      return {
        viewCount: news.view_count || 0,
        reactions: {
          like: reactionCounts.like || 0,
          important: reactionCounts.important || 0,
          interesting: reactionCounts.interesting || 0,
        },
        commentCount: commentCount || 0,
        trendingScore: Math.round(trendingScore),
      };
    },
    refetchInterval: 30000, // Refresh every 30s
  });
}
