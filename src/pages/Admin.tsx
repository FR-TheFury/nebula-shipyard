import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Users, Ship, Image, ScrollText, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function Admin() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [syncingShips, setSyncingShips] = useState(false);
  const [syncingNews, setSyncingNews] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin())) {
      navigate('/');
      toast({
        variant: 'destructive',
        title: t('errors.unauthorized'),
        description: 'You must be an admin to access this page',
      });
    }
  }, [user, isAdmin, authLoading, navigate, toast, t]);

  // Fetch users with their roles
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      // First get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (profilesError) throw profilesError;
      
      // Then get all user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');
      
      if (rolesError) throw rolesError;
      
      // Merge the data
      return profiles.map(profile => ({
        ...profile,
        user_roles: roles.filter(role => role.user_id === profile.id)
      }));
    },
    enabled: !!user && isAdmin(),
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [shipsRes, newsRes, galleryRes, logsRes] = await Promise.all([
        supabase.from('ships').select('id', { count: 'exact', head: true }),
        supabase.from('news').select('id', { count: 'exact', head: true }),
        supabase.from('gallery_posts').select('id', { count: 'exact', head: true }),
        supabase.from('logs').select('id', { count: 'exact', head: true }),
      ]);

      return {
        ships: shipsRes.count || 0,
        news: newsRes.count || 0,
        gallery: galleryRes.count || 0,
        logs: logsRes.count || 0,
      };
    },
    enabled: !!user && isAdmin(),
  });

  // Sync ships mutation
  const syncShips = async () => {
    setSyncingShips(true);
    try {
      const { data, error } = await supabase.functions.invoke('ships-sync', {
        body: { force: true },
      });
      
      if (error) throw error;
      
      toast({
        title: t('admin.resyncSuccess'),
        description: `Synced ${data.upserts} ships`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['ships'] });
      queryClient.invalidateQueries({ queryKey: ['latest-ships'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('admin.resyncError'),
        description: error.message,
      });
    } finally {
      setSyncingShips(false);
    }
  };
  // Sync news mutation
  const syncNews = async () => {
    setSyncingNews(true);
    try {
      const { data, error } = await supabase.functions.invoke('news-sync', {
        body: { force: true },
      });
      
      if (error) throw error;
      
      toast({
        title: 'News synced successfully',
        description: `Synced ${data.upserts} news items`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['news'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error syncing news',
        description: error.message,
      });
    } finally {
      setSyncingNews(false);
    }
  };
  // Toggle admin role
  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isCurrentlyAdmin }: { userId: string; isCurrentlyAdmin: boolean }) => {
      if (isCurrentlyAdmin) {
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', 'admin');
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: 'admin' });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: 'Role updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error updating role',
        description: error.message,
      });
    },
  });

  if (authLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!user || !isAdmin()) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-neon-pink to-neon-purple bg-clip-text text-transparent">
          {t('admin.title')}
        </h1>
        <p className="text-muted-foreground">Manage your Neon Space community</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-neon-blue/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Ship className="w-4 h-4 text-neon-blue" />
              Ships
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neon-blue">{stats?.ships || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-neon-pink/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-neon-pink" />
              News
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neon-pink">{stats?.news || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-neon-purple/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Image className="w-4 h-4 text-neon-purple" />
              Gallery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neon-purple">{stats?.gallery || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-neon-orange/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-neon-orange" />
              Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neon-orange">{users?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sync" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sync">Synchronization</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-4">
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ship className="w-5 h-5 text-neon-blue" />
                Ships Synchronization
              </CardTitle>
              <CardDescription>
                Sync ships data from Star Citizen Wiki API. Uses hash comparison to avoid unnecessary updates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  onClick={syncShips} 
                  disabled={syncingShips}
                  className="bg-gradient-to-r from-neon-blue to-neon-purple hover:shadow-lg hover:shadow-primary/50"
                >
                  {syncingShips ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Sync All Ships
                    </>
                  )}
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>• Automatic sync runs daily at 04:00</p>
                <p>• Only updates changed or new ships</p>
                <p>• Source: Star Citizen Wiki API</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-neon-pink" />
                News Synchronization
              </CardTitle>
              <CardDescription>
                Sync news from Roberts Space Industries RSS feed. Uses hash comparison to avoid unnecessary updates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  onClick={syncNews} 
                  disabled={syncingNews}
                  className="bg-gradient-to-r from-neon-pink to-neon-orange hover:shadow-lg hover:shadow-primary/50"
                >
                  {syncingNews ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Sync All News
                    </>
                  )}
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>• Automatic sync runs daily at 06:00</p>
                <p>• Only updates changed or new articles</p>
                <p>• Source: RSI RSS Feed</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Manage user roles and permissions</CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {users?.map((profile) => {
                    const isUserAdmin = profile.user_roles?.some((r) => r.role === 'admin') || false;
                    
                    return (
                      <div
                        key={profile.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg bg-background/50"
                      >
                        <div>
                          <p className="font-medium">{profile.display_name}</p>
                          <p className="text-sm text-muted-foreground">@{profile.handle}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isUserAdmin && (
                            <Badge variant="secondary" className="bg-neon-pink/20 text-neon-pink border-neon-pink/30">
                              Admin
                            </Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleAdminMutation.mutate({
                              userId: profile.id,
                              isCurrentlyAdmin: isUserAdmin,
                            })}
                            disabled={profile.id === user.id}
                          >
                            {isUserAdmin ? 'Remove Admin' : 'Make Admin'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Audit Logs</CardTitle>
              <CardDescription>System activity and synchronization logs</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Audit logs feature coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
