import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

type ReactionType = "like" | "important" | "interesting";

export function useNewsReaction(newsId: number, userId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's current reactions
  const { data: userReactions = [] } = useQuery({
    queryKey: ["user-reactions", newsId, userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from("news_reactions")
        .select("reaction_type")
        .eq("news_id", newsId)
        .eq("user_id", userId);

      if (error) throw error;
      return data.map((r) => r.reaction_type as ReactionType);
    },
    enabled: !!userId,
  });

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel(`news-reactions-${newsId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "news_reactions",
          filter: `news_id=eq.${newsId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["news-stats", newsId] });
          queryClient.invalidateQueries({ queryKey: ["user-reactions", newsId, userId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [newsId, userId, queryClient]);

  // Add reaction mutation
  const addReaction = useMutation({
    mutationFn: async (reactionType: ReactionType) => {
      if (!userId) throw new Error("User must be logged in");

      const { error } = await supabase.from("news_reactions").insert({
        news_id: newsId,
        user_id: userId,
        reaction_type: reactionType,
      });

      if (error) throw error;

      // Update reaction counts in news table
      const { data: news } = await supabase
        .from("news")
        .select("reaction_counts")
        .eq("id", newsId)
        .single();

      const counts = news?.reaction_counts || { like: 0, important: 0, interesting: 0 };
      counts[reactionType] = (counts[reactionType] || 0) + 1;

      await supabase
        .from("news")
        .update({ reaction_counts: counts })
        .eq("id", newsId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news-stats", newsId] });
      queryClient.invalidateQueries({ queryKey: ["user-reactions", newsId, userId] });
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter la réaction",
        variant: "destructive",
      });
      console.error("Error adding reaction:", error);
    },
  });

  // Remove reaction mutation
  const removeReaction = useMutation({
    mutationFn: async (reactionType: ReactionType) => {
      if (!userId) throw new Error("User must be logged in");

      const { error } = await supabase
        .from("news_reactions")
        .delete()
        .eq("news_id", newsId)
        .eq("user_id", userId)
        .eq("reaction_type", reactionType);

      if (error) throw error;

      // Update reaction counts in news table
      const { data: news } = await supabase
        .from("news")
        .select("reaction_counts")
        .eq("id", newsId)
        .single();

      const counts = news?.reaction_counts || { like: 0, important: 0, interesting: 0 };
      counts[reactionType] = Math.max(0, (counts[reactionType] || 0) - 1);

      await supabase
        .from("news")
        .update({ reaction_counts: counts })
        .eq("id", newsId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news-stats", newsId] });
      queryClient.invalidateQueries({ queryKey: ["user-reactions", newsId, userId] });
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Impossible de retirer la réaction",
        variant: "destructive",
      });
      console.error("Error removing reaction:", error);
    },
  });

  const toggleReaction = (reactionType: ReactionType) => {
    if (!userId) {
      toast({
        title: "Connexion requise",
        description: "Vous devez être connecté pour réagir",
        variant: "destructive",
      });
      return;
    }

    if (userReactions.includes(reactionType)) {
      removeReaction.mutate(reactionType);
    } else {
      addReaction.mutate(reactionType);
    }
  };

  return {
    userReactions,
    toggleReaction,
    isLoading: addReaction.isPending || removeReaction.isPending,
  };
}
