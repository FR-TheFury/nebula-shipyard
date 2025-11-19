import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Trash2, PlayCircle, Database, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export default function AdminDebug() {
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isForceStopping, setIsForceStopping] = useState(false);

  // Validation queries
  const { data: slugValidation, refetch: refetchSlugValidation } = useQuery({
    queryKey: ['slug-validation-check'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ship_slug_mappings')
        .select('validation_status');
      
      if (error) throw error;
      
      // Count by validation_status
      const counts: Record<string, number> = {};
      data?.forEach((row: any) => {
        const status = row.validation_status || 'pending';
        counts[status] = (counts[status] || 0) + 1;
      });
      
      const total = data?.length || 0;
      return Object.entries(counts).map(([status, count]) => ({
        validation_status: status,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100 * 100) / 100 : 0
      }));
    },
    enabled: false
  });

  const { data: fleetyardsData, refetch: refetchFleetyardsData } = useQuery({
    queryKey: ['fleetyards-data-check'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ships')
        .select('id')
        .not('fleetyards_slug_used', 'is', null);
      if (error) throw error;
      return { count: data?.length || 0 };
    },
    enabled: false
  });

  const { data: syncProgress, refetch: refetchSyncProgress } = useQuery({
    queryKey: ['sync-progress-check'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_progress')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: false
  });

  const handleCleanup = async () => {
    setIsCleaningUp(true);
    try {
      console.log('🧹 Calling cleanup_zombie_sync_jobs RPC...');
      const { error } = await supabase.rpc('cleanup_zombie_sync_jobs');
      
      if (error) {
        console.error('Cleanup error:', error);
        throw error;
      }
      
      toast.success('✓ Cleanup completed successfully!');
      await refetchSyncProgress();
    } catch (error: any) {
      console.error('Error during cleanup:', error);
      toast.error(`Cleanup failed: ${error.message}`);
    } finally {
      setIsCleaningUp(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      console.log('🚀 Starting ships-sync...');
      const { error } = await supabase.functions.invoke('ships-sync', {
        body: { force: true, auto_sync: false }
      });
      
      if (error) {
        console.error('Sync error:', error);
        throw error;
      }
      
      toast.success('✓ Sync started successfully! Check progress in admin panel.');
      
      // Wait a bit and refetch
      setTimeout(() => {
        refetchSyncProgress();
      }, 2000);
    } catch (error: any) {
      console.error('Error starting sync:', error);
      toast.error(`Sync failed: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleForceStopAll = async () => {
    setIsForceStopping(true);
    try {
      console.log('🛑 Force stopping all syncs...');
      
      // 1. Delete all locks
      const { error: lockError } = await supabase
        .from('edge_function_locks')
        .delete()
        .neq('function_name', ''); // Delete all
      
      if (lockError) {
        console.error('Error deleting locks:', lockError);
        throw lockError;
      }
      
      // 2. Cancel all running syncs
      const { error: syncError } = await supabase
        .from('sync_progress')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          error_message: 'Force stopped by admin'
        })
        .eq('status', 'running');
      
      if (syncError) {
        console.error('Error cancelling syncs:', syncError);
        throw syncError;
      }
      
      toast.success('✓ All syncs force stopped and locks cleared!');
      await refetchSyncProgress();
    } catch (error: any) {
      console.error('Error force stopping:', error);
      toast.error(`Force stop failed: ${error.message}`);
    } finally {
      setIsForceStopping(false);
    }
  };

  const handleValidateAll = async () => {
    await Promise.all([
      refetchSlugValidation(),
      refetchFleetyardsData(),
      refetchSyncProgress()
    ]);
    toast.success('✓ Validation checks completed!');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Admin Debug & Testing</h1>
        <p className="text-muted-foreground">
          Test and validate the complete ship sync system
        </p>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Test the cleanup and sync workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Button
              onClick={handleForceStopAll}
              disabled={isForceStopping}
              variant="destructive"
              className="gap-2"
            >
              <XCircle className="w-4 h-4" />
              {isForceStopping ? 'Stopping...' : '🛑 Force Stop All'}
            </Button>
            
            <Button
              onClick={handleCleanup}
              disabled={isCleaningUp || syncProgress?.status === 'running'}
              variant="outline"
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {isCleaningUp ? 'Cleaning...' : '1. Cleanup Zombies'}
            </Button>
            
            <Button
              onClick={handleSync}
              disabled={isSyncing || syncProgress?.status === 'running'}
              className="gap-2"
            >
              <PlayCircle className="w-4 h-4" />
              {isSyncing ? 'Syncing...' : '2. Start Sync'}
            </Button>
            
            <Button
              onClick={handleValidateAll}
              variant="outline"
              className="gap-2"
            >
              <Database className="w-4 h-4" />
              3. Validate Results
            </Button>
          </div>
          
          <div className="text-sm text-muted-foreground bg-muted p-4 rounded-md">
            <p className="font-semibold mb-2">Testing Workflow:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Click "Cleanup Zombies" to clear stuck sync instances</li>
              <li>Click "Start Sync" to trigger a fresh synchronization</li>
              <li>Wait 2-3 minutes for sync to complete</li>
              <li>Click "Validate Results" to check the data</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Sync Progress */}
      {syncProgress && (
        <Card>
          <CardHeader>
            <CardTitle>Latest Sync Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                <span className={`text-sm font-semibold ${
                  syncProgress.status === 'completed' ? 'text-green-600' :
                  syncProgress.status === 'failed' ? 'text-red-600' :
                  syncProgress.status === 'running' ? 'text-blue-600' :
                  'text-yellow-600'
                }`}>
                  {syncProgress.status?.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Progress:</span>
                <span className="text-sm">{syncProgress.current_item} / {syncProgress.total_items}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Success:</span>
                <span className="text-sm text-green-600 font-semibold">{syncProgress.success_count || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Failed:</span>
                <span className="text-sm text-red-600 font-semibold">{syncProgress.failed_count || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Skipped:</span>
                <span className="text-sm text-yellow-600 font-semibold">{syncProgress.skipped_count || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Slug Validation Status
            </CardTitle>
            <CardDescription>
              Distribution of validation statuses
            </CardDescription>
          </CardHeader>
          <CardContent>
            {slugValidation && Array.isArray(slugValidation) && slugValidation.length > 0 ? (
              <div className="space-y-2">
                {slugValidation.map((row: any) => (
                  <div key={row.validation_status} className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{row.validation_status}:</span>
                    <span className="text-sm">
                      {row.count} ({row.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Click "Validate Results" to check</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              FleetYards Data
            </CardTitle>
            <CardDescription>
              Ships with FleetYards data
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fleetyardsData ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Ships with FleetYards slug:</span>
                  <span className="text-sm font-semibold text-blue-600">{fleetyardsData.count}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-4">
                  {fleetyardsData.count > 0 ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-3 h-3" />
                      FleetYards data is being persisted!
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-yellow-600">
                      <AlertCircle className="w-3 h-3" />
                      No FleetYards data found yet
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Click "Validate Results" to check</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SQL Queries for Manual Validation */}
      <Card>
        <CardHeader>
          <CardTitle>Manual SQL Validation Queries</CardTitle>
          <CardDescription>
            Run these queries in the Supabase SQL Editor to verify the system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold">1. Check Slug Validation Distribution:</p>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
{`SELECT 
  validation_status,
  COUNT(*) as count,
  ROUND(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM ship_slug_mappings) * 100, 2) as percentage
FROM ship_slug_mappings
GROUP BY validation_status
ORDER BY count DESC;`}
            </pre>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">2. Check FleetYards Data Persistence:</p>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
{`SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN fleetyards_slug_used IS NOT NULL THEN 1 END) as with_slug,
  COUNT(CASE WHEN jsonb_array_length(fleetyards_images) > 0 THEN 1 END) as with_images,
  COUNT(CASE WHEN jsonb_array_length(fleetyards_videos) > 0 THEN 1 END) as with_videos
FROM ships;`}
            </pre>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">3. Check Recent Sync Progress:</p>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
{`SELECT 
  id, function_name, status,
  success_count, failed_count, skipped_count,
  started_at, completed_at
FROM sync_progress
WHERE started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC
LIMIT 5;`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
