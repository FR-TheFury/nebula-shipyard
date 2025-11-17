import { Eye, MessageSquare, TrendingUp } from "lucide-react";
import { useNewsStats } from "@/hooks/useNewsStats";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

interface NewsStatsProps {
  newsId: number;
  publishedAt: string;
  variant?: "default" | "minimal";
}

export function NewsStats({ newsId, publishedAt, variant = "default" }: NewsStatsProps) {
  const { data: stats, isLoading } = useNewsStats(newsId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-20" />
      </div>
    );
  }

  const isMinimal = variant === "minimal";
  const isTrending = (stats?.trendingScore || 0) > 50;

  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
      {/* View count */}
      <div className="flex items-center gap-1.5">
        <Eye className="h-4 w-4" />
        <span>{stats?.viewCount || 0}</span>
        {!isMinimal && <span className="hidden sm:inline">vues</span>}
      </div>

      {/* Comment count */}
      {(stats?.commentCount || 0) > 0 && (
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4" />
          <span>{stats?.commentCount}</span>
          {!isMinimal && <span className="hidden sm:inline">commentaires</span>}
        </div>
      )}

      {/* Trending badge */}
      {isTrending && (
        <Badge variant="secondary" className="gap-1">
          <TrendingUp className="h-3 w-3" />
          Tendance
        </Badge>
      )}

      {/* Published date */}
      <span className="text-xs">
        {format(new Date(publishedAt), "d MMM yyyy", { locale: fr })}
      </span>
    </div>
  );
}
