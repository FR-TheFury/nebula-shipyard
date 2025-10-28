import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function GalleryPostDetail() {
  const { id } = useParams();
  const { t } = useTranslation();

  const { data: post, isLoading } = useQuery({
    queryKey: ['gallery-post', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gallery_posts')
        .select(`
          *,
          gallery_images(image_url, idx),
          profiles(handle, display_name, avatar_url)
        `)
        .eq('id', parseInt(id || '0'))
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Card>
          <Skeleton className="aspect-video w-full" />
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="space-y-6">
        <Link to="/gallery">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Gallery
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Post not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sortedImages = post.gallery_images?.sort((a, b) => a.idx - b.idx) || [];

  return (
    <div className="space-y-4 md:space-y-6">
      <Link to="/gallery">
        <Button variant="outline" className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          {t('common.back')}
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl">{post.title}</CardTitle>
          <CardDescription className="flex items-center gap-2">
            {post.profiles?.avatar_url && (
              <img
                src={post.profiles.avatar_url}
                alt={post.profiles.display_name}
                className="w-6 h-6 rounded-full"
              />
            )}
            <span>by {post.profiles?.display_name || 'Unknown'}</span>
            {post.location && <span>• {post.location}</span>}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {post.description_md && (
            <p className="text-sm sm:text-base text-muted-foreground whitespace-pre-wrap">
              {post.description_md}
            </p>
          )}

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {post.video_url && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Video</h3>
              <video
                controls
                className="w-full rounded-lg bg-black"
                src={post.video_url}
              >
                Your browser does not support the video tag.
              </video>
            </div>
          )}

          {post.gif_url && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">GIF</h3>
              <img
                src={post.gif_url}
                alt="GIF"
                className="w-full rounded-lg"
              />
            </div>
          )}

          {sortedImages.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Images ({sortedImages.length})</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sortedImages.map((img, idx) => (
                  <img
                    key={idx}
                    src={img.image_url}
                    alt={`${post.title} - Image ${idx + 1}`}
                    className="w-full rounded-lg object-cover aspect-video"
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
