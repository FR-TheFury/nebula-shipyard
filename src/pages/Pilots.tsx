import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Pilots() {
  const [search, setSearch] = useState('');

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('approved', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Get logs count for each profile
  const { data: logsCounts } = useQuery({
    queryKey: ['logs-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logs')
        .select('user_id')
        .order('user_id');
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach(log => {
        counts[log.user_id] = (counts[log.user_id] || 0) + 1;
      });
      return counts;
    },
  });

  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    if (!search.trim()) return profiles;
    
    const query = search.toLowerCase();
    return profiles.filter(p => 
      p.display_name.toLowerCase().includes(query) ||
      p.handle.toLowerCase().includes(query) ||
      (p.bio_md && p.bio_md.toLowerCase().includes(query))
    );
  }, [profiles, search]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">Pilots Directory</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center gap-4">
                <Skeleton className="w-16 h-16 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Users className="w-8 h-8 md:w-10 md:h-10 text-primary" />
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">Pilots Directory</h1>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground">
          Discover fellow citizens and their adventures
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, handle, or bio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {filteredProfiles.length} pilot{filteredProfiles.length !== 1 ? 's' : ''} found
      </div>

      {/* Profiles Grid */}
      {filteredProfiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm sm:text-base text-muted-foreground">
              No pilots found matching your search
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {filteredProfiles.map((profile) => {
            const logsCount = logsCounts?.[profile.id] || 0;
            return (
              <Link key={profile.id} to={`/pilots/${profile.handle}`}>
                <Card className="h-full hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center gap-4 mb-2">
                      <Avatar className="w-16 h-16">
                        <AvatarImage src={profile.avatar_url || undefined} />
                        <AvatarFallback className="text-xl">
                          {profile.display_name?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{profile.display_name}</CardTitle>
                        <CardDescription className="truncate">@{profile.handle}</CardDescription>
                      </div>
                    </div>
                    
                    {profile.bio_md && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                        {profile.bio_md}
                      </p>
                    )}
                  </CardHeader>
                  
                  <CardContent>
                    <div className="flex gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {logsCount} log{logsCount !== 1 ? 's' : ''}
                      </Badge>
                      {profile.approved && (
                        <Badge variant="outline" className="text-xs border-primary text-primary">
                          Verified
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
