import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import type { Tables } from '@/integrations/supabase/types';

type GalleryPost = Tables<'gallery_posts'> & {
  gallery_images?: Array<{ image_url: string }>;
  profiles?: { handle: string; display_name: string } | null;
};

interface GalleryCardProps {
  post: GalleryPost;
}

export function GalleryCard({ post }: GalleryCardProps) {
  const firstImage = post.gallery_images?.[0]?.image_url;

  return (
    <Link to="/gallery">
      <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1 bg-card/50 backdrop-blur-sm border-primary/20 hover:border-primary/50">
        {firstImage && (
          <div className="aspect-video bg-muted relative overflow-hidden group">
            <img
              src={firstImage}
              alt={post.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}
        <CardHeader>
          <CardTitle className="text-neon-blue">{post.title}</CardTitle>
          <CardDescription>
            by {post.profiles?.display_name || 'Unknown'}
          </CardDescription>
        </CardHeader>
        {(post.location || post.tags) && (
          <CardContent>
            <div className="space-y-2">
              {post.location && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <span className="text-neon-orange">📍</span> {post.location}
                </p>
              )}
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {post.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" className="bg-neon-pink/20 text-neon-pink border-neon-pink/30">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}
