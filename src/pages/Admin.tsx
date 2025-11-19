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
import { RefreshCw, Users, Ship, Image, ScrollText, Loader2, Clock, CheckCircle2, XCircle, StopCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ShipDataComparison } from '@/components/ShipDataComparison';
import { Skeleton } from '@/components/ui/skeleton';
import { SyncProgressMonitor } from '@/components/SyncProgressMonitor';
import { SlugMappingManager } from '@/components/SlugMappingManager';

export default function Admin() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [syncingShips, setSyncingShips] = useState(false);
  const [syncingNews, setSyncingNews] = useState(false);
  const [syncingNewShips, setSyncingNewShips] = useState(false);
  const [syncingServerStatus, setSyncingServerStatus] = useState(false);
  const [isForceStopping, setIsForceStopping] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

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

  // Fetch CRON job history
  const { data: cronHistory, isLoading: cronHistoryLoading } = useQuery({
    queryKey: ['cron-job-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cron_job_history')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user && isAdmin(),
  });

  // Setup Realtime subscription for CRON job history
  useEffect(() => {
    if (!user || !isAdmin()) return;

    const channel = supabase
      .channel('cron-job-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cron_job_history' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cron-job-history'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isAdmin, queryClient]);

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

  // Sync new ships mutation
  const syncNewShips = async () => {
    setSyncingNewShips(true);
    try {
      const { data, error } = await supabase.functions.invoke('new-ships-sync', {
        body: {},
      });
      
      if (error) throw error;
      
      toast({
        title: 'New Ships synced successfully',
        description: `Synced ${data.itemsSynced || 0} items`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['news'] });
      queryClient.invalidateQueries({ queryKey: ['news-categories'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error syncing new ships',
        description: error.message,
      });
    } finally {
      setSyncingNewShips(false);
    }
  };

  // Sync server status mutation
  const syncServerStatus = async () => {
    setSyncingServerStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('server-status-sync', {
        body: {},
      });
      
      if (error) throw error;
      
      toast({
        title: 'Server Status synced successfully',
        description: `Synced ${data.itemsSynced || 0} items`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['news'] });
      queryClient.invalidateQueries({ queryKey: ['news-categories'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error syncing server status',
        description: error.message,
      });
    } finally {
      setSyncingServerStatus(false);
    }
  };

  // Force stop all syncs
  const handleForceStopAll = async () => {
    setIsForceStopping(true);
    try {
      // Delete all locks
      const { error: locksError } = await supabase
        .from('edge_function_locks')
        .delete()
        .neq('function_name', '');
      
      if (locksError) throw locksError;

      // Cancel all running syncs
      const { error: syncError } = await supabase
        .from('sync_progress')
        .update({ 
          status: 'cancelled',
          error_message: 'Force stopped by admin',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('status', 'running');
      
      if (syncError) throw syncError;

      toast({
        title: 'All syncs stopped',
        description: 'All running syncs have been cancelled and locks released',
      });

      queryClient.invalidateQueries({ queryKey: ['sync-progress'] });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error stopping syncs',
        description: error.message,
      });
    } finally {
      setIsForceStopping(false);
    }
  };

  // Cleanup zombie syncs
  const handleCleanupZombies = async () => {
    setIsCleaningUp(true);
    try {
      const { error } = await supabase.rpc('cleanup_zombie_sync_jobs');
      
      if (error) throw error;

      toast({
        title: 'Cleanup completed',
        description: 'Zombie sync jobs and expired locks have been cleaned up',
      });

      queryClient.invalidateQueries({ queryKey: ['sync-progress'] });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error cleaning up',
        description: error.message,
      });
    } finally {
      setIsCleaningUp(false);
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

  // Approve user mutation
  const approveUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('approve_user', { target_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: 'Utilisateur approuvé',
        description: 'L\'utilisateur peut maintenant se connecter',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Erreur lors de l\'approbation',
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

      {/* Auto Sync Status & Controls */}
      <Card className="bg-card/50 backdrop-blur-sm border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StopCircle className="w-5 h-5 text-destructive" />
            Auto Sync Status & Controls
          </CardTitle>
          <CardDescription>
            Emergency controls for managing synchronization processes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button 
              onClick={handleForceStopAll} 
              disabled={isForceStopping}
              variant="destructive"
            >
              {isForceStopping ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <StopCircle className="w-4 h-4 mr-2" />
                  Force Stop All Syncs
                </>
              )}
            </Button>
            <Button 
              onClick={handleCleanupZombies} 
              disabled={isCleaningUp}
              variant="outline"
            >
              {isCleaningUp ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cleaning...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Cleanup Zombies
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

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
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="sync">Synchronization</TabsTrigger>
          <TabsTrigger value="slugmapping">Slug Mapping</TabsTrigger>
          <TabsTrigger value="shipdata">Ship Data</TabsTrigger>
          <TabsTrigger value="autosync">Auto-Sync Status</TabsTrigger>
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

          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ship className="w-5 h-5 text-green-500" />
                New Ships Synchronization
              </CardTitle>
              <CardDescription>
                Sync new ship announcements from Star Citizen API. Filters for genuinely new ships (created within last 30 days).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  onClick={syncNewShips} 
                  disabled={syncingNewShips}
                  className="bg-gradient-to-r from-green-500 to-emerald-600 hover:shadow-lg hover:shadow-green-500/50"
                >
                  {syncingNewShips ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Sync New Ships
                    </>
                  )}
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>• Automatic sync runs daily at 04:00</p>
                <p>• Only shows truly new ships, not updates</p>
                <p>• Source: Star Citizen API</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-500" />
                Server Status Synchronization
              </CardTitle>
              <CardDescription>
                Sync server status information from RSI Status page. Updates every hour automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  onClick={syncServerStatus} 
                  disabled={syncingServerStatus}
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:shadow-lg hover:shadow-yellow-500/50"
                >
                  {syncingServerStatus ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Sync Server Status
                    </>
                  )}
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>• Automatic sync runs every hour</p>
                <p>• Monitors RSI services status</p>
                <p>• Source: RSI Status Page</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slugmapping" className="space-y-4">
          <SlugMappingManager />
        </TabsContent>

        <TabsContent value="shipdata" className="space-y-4">
          <ShipDataComparison />
        </TabsContent>

        <TabsContent value="autosync" className="space-y-4">
          <SyncProgressMonitor functionName="ships-sync" />
          
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-neon-purple" />
                Automatic Synchronization Status
              </CardTitle>
              <CardDescription>
                CRON jobs automatically sync news every 2 hours and ships every 6 hours
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cronHistoryLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : cronHistory && cronHistory.length > 0 ? (
                <div className="space-y-2">
                  {cronHistory.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg bg-background/50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">{job.job_name}</p>
                          {job.status === 'success' && (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Success
                            </Badge>
                          )}
                          {job.status === 'failed' && (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
                              <XCircle className="w-3 h-3 mr-1" />
                              Failed
                            </Badge>
                          )}
                          {job.status === 'running' && (
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Running
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span>Items: {job.items_synced || 0}</span>
                          <span>Duration: {job.duration_ms ? `${job.duration_ms}ms` : 'N/A'}</span>
                          <span>Executed: {new Date(job.executed_at).toLocaleString('fr-FR')}</span>
                        </div>
                        {job.error_message && (
                          <p className="text-xs text-red-400 mt-1">Error: {job.error_message}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No synchronization history found</p>
              )}
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
                        <div className="flex-1">
                          <p className="font-medium">{profile.display_name}</p>
                          <p className="text-sm text-muted-foreground">@{profile.handle}</p>
                          <p className="text-xs text-muted-foreground">
                            Créé le: {new Date(profile.created_at).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!profile.approved && (
                            <Badge variant="secondary" className="bg-neon-orange/20 text-neon-orange border-neon-orange/30">
                              En attente
                            </Badge>
                          )}
                          {profile.approved && (
                            <Badge variant="secondary" className="bg-neon-blue/20 text-neon-blue border-neon-blue/30">
                              Approuvé
                            </Badge>
                          )}
                          {isUserAdmin && (
                            <Badge variant="secondary" className="bg-neon-pink/20 text-neon-pink border-neon-pink/30">
                              Admin
                            </Badge>
                          )}
                          {!profile.approved && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => approveUserMutation.mutate(profile.id)}
                              className="bg-gradient-to-r from-neon-blue to-neon-purple"
                            >
                              Approuver
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleAdminMutation.mutate({
                              userId: profile.id,
                              isCurrentlyAdmin: isUserAdmin,
                            })}
                            disabled={profile.id === user.id || !profile.approved}
                          >
                            {isUserAdmin ? 'Retirer Admin' : 'Rendre Admin'}
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
