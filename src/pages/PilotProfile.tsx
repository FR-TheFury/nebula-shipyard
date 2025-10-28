import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function PilotProfile() {
  const { handle } = useParams();
  const navigate = useNavigate();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['pilot-profile', handle],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('handle', handle)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['pilot-logs', profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      const { data, error } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  if (profileLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <Skeleton className="w-20 h-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Pilot not found</p>
        <Button onClick={() => navigate('/pilots')}>Back to Directory</Button>
      </div>
    );
  }

  const stats = profile.stats as any;

  return (
    <div className="space-y-4 md:space-y-6">
      <Button variant="ghost" onClick={() => navigate('/pilots')} className="gap-2">
        <ArrowLeft className="w-4 h-4" />
        Back to Pilots
      </Button>

      {/* Profile Card */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Avatar className="w-16 h-16 sm:w-20 sm:h-20">
            <AvatarImage src={profile.avatar_url || undefined} />
            <AvatarFallback className="text-xl sm:text-2xl">
              {profile.display_name?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-xl sm:text-2xl">{profile.display_name}</CardTitle>
            <CardDescription className="text-sm sm:text-base">@{profile.handle}</CardDescription>
          </div>
        </CardHeader>
        {profile.bio_md && (
          <CardContent>
            <p className="text-sm sm:text-base text-muted-foreground">{profile.bio_md}</p>
          </CardContent>
        )}
      </Card>

      {/* Stats */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {Object.entries(stats).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <p className="text-xs sm:text-sm text-muted-foreground capitalize">
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold">{String(value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pilot Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">
            Pilot Logs ({logs?.length || 0})
          </CardTitle>
          <CardDescription>Recent mission entries</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No logs yet
            </p>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                  <h3 className="font-semibold text-sm sm:text-base mb-2">{log.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mb-2">
                    {log.body_md}
                  </p>
                  {log.tags && log.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {log.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(log.created_at!).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
