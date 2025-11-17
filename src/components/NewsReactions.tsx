import { Heart, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNewsReaction } from "@/hooks/useNewsReaction";
import { useNewsStats } from "@/hooks/useNewsStats";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface NewsReactionsProps {
  newsId: number;
  userId?: string;
  variant?: "default" | "compact";
}

const reactionConfig = {
  like: {
    icon: Heart,
    label: "J'aime",
    color: "text-pink-500",
    activeColor: "bg-pink-500/10 text-pink-500 border-pink-500",
  },
  important: {
    icon: AlertCircle,
    label: "Important",
    color: "text-orange-500",
    activeColor: "bg-orange-500/10 text-orange-500 border-orange-500",
  },
  interesting: {
    icon: Sparkles,
    label: "Intéressant",
    color: "text-blue-500",
    activeColor: "bg-blue-500/10 text-blue-500 border-blue-500",
  },
};

export function NewsReactions({ newsId, userId, variant = "default" }: NewsReactionsProps) {
  const { userReactions, toggleReaction, isLoading } = useNewsReaction(newsId, userId);
  const { data: stats } = useNewsStats(newsId);

  const isCompact = variant === "compact";

  return (
    <div className={cn("flex items-center gap-2", isCompact ? "gap-1" : "gap-2")}>
      {Object.entries(reactionConfig).map(([type, config]) => {
        const Icon = config.icon;
        const count = stats?.reactions[type as keyof typeof stats.reactions] || 0;
        const isActive = userReactions.includes(type as any);

        return (
          <motion.div
            key={type}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button
              variant="outline"
              size={isCompact ? "sm" : "default"}
              onClick={() => toggleReaction(type as any)}
              disabled={isLoading}
              className={cn(
                "gap-1.5 transition-all duration-200",
                isActive && config.activeColor
              )}
            >
              <Icon className={cn("h-4 w-4", isActive && config.color)} />
              {!isCompact && <span className="text-sm">{config.label}</span>}
              {count > 0 && (
                <span className={cn("text-xs font-semibold", isActive && config.color)}>
                  {count}
                </span>
              )}
            </Button>
          </motion.div>
        );
      })}
    </div>
  );
}
