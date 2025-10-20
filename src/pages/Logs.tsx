import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export default function Logs() {
  const { user } = useAuth();

  const { data: logs, isLoading } = useQuery({
    queryKey: ['logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logs')
        .select(`
          *,
          profiles(handle, display_name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-4xl font-bold">Logs</h1>
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold mb-2">Logs</h1>
          <p className="text-muted-foreground">Pilot adventures and experiences</p>
        </div>
        {user && (
          <Link to="/auth">
            <Button>Create Log</Button>
          </Link>
        )}
      </div>

      {logs && logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-muted-foreground">No logs yet</p>
            {!user && (
              <Link to="/auth">
                <Button>Sign in to create a log</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {logs?.map((log) => (
            <Card key={log.id}>
              <CardHeader>
                <CardTitle>{log.title}</CardTitle>
                <CardDescription>
                  by {log.profiles?.display_name || 'Unknown'} • {new Date(log.created_at!).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {log.image_url && (
                  <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                    <img
                      src={log.image_url}
                      alt={log.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <p className="text-sm line-clamp-3">{log.body_md}</p>
                {log.tags && log.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {log.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
