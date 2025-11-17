import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useNewsView(newsId: number, userId?: string) {
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per session
    if (hasTracked.current) return;

    const trackView = async () => {
      // Generate a session ID if not exists
      let sessionId = sessionStorage.getItem("news-session-id");
      if (!sessionId) {
        sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem("news-session-id", sessionId);
      }

      try {
        await supabase.from("news_views").insert({
          news_id: newsId,
          user_id: userId || null,
          session_id: sessionId,
        });

        hasTracked.current = true;
      } catch (error) {
        console.error("Error tracking news view:", error);
      }
    };

    // Delay tracking to ensure user is actually viewing
    const timer = setTimeout(trackView, 2000);

    return () => clearTimeout(timer);
  }, [newsId, userId]);
}
