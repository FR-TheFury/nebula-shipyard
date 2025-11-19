import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Clock, Ship, AlertTriangle, ChevronDown, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';

interface SyncProgress {
  id: number;
  function_name: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  current_item: number;
  total_items: number;
  current_ship_name: string | null;
  current_ship_slug: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata: any;
  progress_percent: number;
  success_count?: number;
  failed_count?: number;
  skipped_count?: number;
  failed_ships?: Array<{slug: string, name: string, error: string}>;
}

export function SyncProgressMonitor({ functionName = 'ships-sync' }: { functionName?: string }) {
  const queryClient = useQueryClient();
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  
  const handleCleanupAndResync = async () => {
    setIsCleaningUp(true);
    
    try {
      console.log('🧹 Starting cleanup and resync...');
      
      // 1. Cleanup zombie jobs using RPC
      const { error: cleanupError } = await supabase.rpc('cleanup_zombie_sync_jobs');
      
      if (cleanupError) {
        console.error('Cleanup error:', cleanupError);
        throw cleanupError;
      }
      
      console.log('✓ Cleanup completed');
      
      // 2. Wait a moment for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 3. Force resync
      console.log('🚀 Starting forced resync...');
      const { error: syncError } = await supabase.functions.invoke('ships-sync', {
        body: { force: true, auto_sync: false }
      });
      
      if (syncError) {
        console.error('Sync error:', syncError);
        throw syncError;
      }
      
      toast.success('✓ Cleanup & resync lancés avec succès !');
      
      // Refetch after a short delay to see the new sync
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['sync-progress', functionName] });
      }, 2000);
      
    } catch (error: any) {
      console.error('Error during cleanup/resync:', error);
      toast.error(`Erreur: ${error.message || 'Échec du cleanup/resync'}`);
    } finally {
      setIsCleaningUp(false);
    }
  };
  
  const { data: progress, isLoading } = useQuery({
    queryKey: ['sync-progress', functionName],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_latest_sync_progress', { p_function_name: functionName });
      
      if (error) {
        console.error('Error fetching sync progress:', error);
        throw error;
      }
      
      console.log('Sync progress data:', data);
      return data?.[0] as SyncProgress | null;
    },
    refetchInterval: (query) => {
      // Refetch every 1 second if running, otherwise every 10 seconds
      const status = query.state.data?.status;
      return status === 'running' ? 1000 : 10000;
    },
  });

  // Setup Realtime subscription for instant updates
  useEffect(() => {
    console.log('Setting up Realtime subscription for sync_progress...');
    
    const channel = supabase
      .channel('sync-progress-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'sync_progress',
          filter: `function_name=eq.${functionName}`
        },
        (payload) => {
          console.log('Realtime sync_progress change:', payload);
          // Invalidate and refetch the query when data changes
          queryClient.invalidateQueries({ queryKey: ['sync-progress', functionName] });
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      console.log('Cleaning up Realtime subscription...');
      supabase.removeChannel(channel);
    };
  }, [functionName, queryClient]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ship className="w-5 h-5" />
            Ship Sync Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!progress) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ship className="w-5 h-5" />
            Ship Sync Progress
          </CardTitle>
          <CardDescription>
            No recent synchronization found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="w-12 h-12 text-muted-foreground mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">
              Waiting for next synchronization to start...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = () => {
    switch (progress.status) {
      case 'running':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusBadge = () => {
    switch (progress.status) {
      case 'running':
        return <Badge variant="default" className="bg-blue-500">Running</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">{progress.status}</Badge>;
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  // Calculate real-time statistics
  const calculateStats = () => {
    const startTime = new Date(progress.started_at).getTime();
    const currentTime = progress.completed_at 
      ? new Date(progress.completed_at).getTime() 
      : Date.now();
    const elapsedMs = currentTime - startTime;
    const elapsedMinutes = elapsedMs / 1000 / 60;
    
    const processedCount = progress.current_item || 0;
    const totalCount = progress.total_items || 1;
    const remainingCount = totalCount - processedCount;
    
    // Processing speed (ships per minute)
    const speed = elapsedMinutes > 0 ? processedCount / elapsedMinutes : 0;
    
    // Estimated time remaining
    const etaMinutes = speed > 0 ? remainingCount / speed : 0;
    const etaMs = etaMinutes * 60 * 1000;
    
    // Success, failed, skipped counts
    const successCount = progress.success_count || 0;
    const failedCount = progress.failed_count || 0;
    const skippedCount = progress.skipped_count || 0;
    
    const successPercent = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
    const failedPercent = totalCount > 0 ? (failedCount / totalCount) * 100 : 0;
    const skippedPercent = totalCount > 0 ? (skippedCount / totalCount) * 100 : 0;
    
    return {
      elapsedMs,
      elapsedFormatted: formatDuration(elapsedMs),
      speed: speed.toFixed(1),
      etaFormatted: formatDuration(etaMs),
      processedCount,
      totalCount,
      remainingCount,
      successCount,
      failedCount,
      skippedCount,
      successPercent: successPercent.toFixed(1),
      failedPercent: failedPercent.toFixed(1),
      skippedPercent: skippedPercent.toFixed(1),
    };
  };

  const stats = calculateStats();
  const elapsedTime = stats.elapsedFormatted;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <motion.div 
              className="flex items-center gap-2"
              key={progress.status}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {getStatusIcon()}
              Ship Sync Progress
            </motion.div>
          </CardTitle>
          <div className="flex items-center gap-2">
            <motion.div
              key={`badge-${progress.status}`}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {getStatusBadge()}
            </motion.div>
            <Button
              onClick={handleCleanupAndResync}
              variant="destructive"
              size="sm"
              disabled={isCleaningUp || progress.status === 'running'}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isCleaningUp ? 'Cleaning...' : 'Cleanup & Resync'}
            </Button>
          </div>
        </div>
        <CardDescription>
          {progress.status === 'running' && 'Synchronization in progress...'}
          {progress.status === 'completed' && `Completed ${formatDistanceToNow(new Date(progress.completed_at!))} ago`}
          {progress.status === 'failed' && 'Synchronization failed'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Real-time Statistics Grid */}
        <motion.div 
          className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg border"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Temps écoulé</div>
            <motion.div 
              className="text-lg font-bold"
              key={stats.elapsedMs}
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              {stats.elapsedFormatted}
            </motion.div>
          </div>
          
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Vitesse</div>
            <motion.div 
              className="text-lg font-bold text-blue-500"
              key={stats.speed}
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              {stats.speed} ships/min
            </motion.div>
          </div>
          
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Temps restant</div>
            <motion.div 
              className="text-lg font-bold text-orange-500"
              key={stats.etaFormatted}
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              {progress.status === 'running' ? stats.etaFormatted : 'N/A'}
            </motion.div>
          </div>
          
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Traités</div>
            <motion.div 
              className="text-lg font-bold"
              key={stats.processedCount}
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              {stats.processedCount}/{stats.totalCount}
            </motion.div>
          </div>
        </motion.div>

        {/* Main Progress Bar */}
        <motion.div 
          className="space-y-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground font-medium">Overall Progress</span>
            <motion.span 
              className="font-bold text-lg"
              key={progress.progress_percent}
              initial={{ scale: 1.2, color: 'hsl(var(--primary))' }}
              animate={{ scale: 1, color: 'hsl(var(--foreground))' }}
              transition={{ duration: 0.3 }}
            >
              {progress.progress_percent.toFixed(1)}%
            </motion.span>
          </div>
          
          {/* Segmented Progress Bar */}
          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="absolute h-full bg-green-500"
              initial={{ width: 0 }}
              animate={{ width: `${stats.successPercent}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            <motion.div
              className="absolute h-full bg-red-500"
              initial={{ width: 0, left: `${stats.successPercent}%` }}
              animate={{ 
                width: `${stats.failedPercent}%`,
                left: `${stats.successPercent}%`
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            <motion.div
              className="absolute h-full bg-yellow-500"
              initial={{ width: 0, left: `${parseFloat(stats.successPercent) + parseFloat(stats.failedPercent)}%` }}
              animate={{ 
                width: `${stats.skippedPercent}%`,
                left: `${parseFloat(stats.successPercent) + parseFloat(stats.failedPercent)}%`
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          
          <div className="flex justify-between items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-muted-foreground">Succès: </span>
                <motion.span 
                  className="font-bold text-green-600"
                  key={stats.successCount}
                >
                  {stats.successCount} ({stats.successPercent}%)
                </motion.span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-muted-foreground">Échecs: </span>
                <motion.span 
                  className="font-bold text-red-600"
                  key={stats.failedCount}
                >
                  {stats.failedCount} ({stats.failedPercent}%)
                </motion.span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-muted-foreground">Skipped: </span>
                <motion.span 
                  className="font-bold text-yellow-600"
                  key={stats.skippedCount}
                >
                  {stats.skippedCount} ({stats.skippedPercent}%)
                </motion.span>
              </div>
            </div>
            <span className="text-muted-foreground">{stats.remainingCount} restants</span>
          </div>
        </motion.div>

        {/* Current Ship Processing */}
        <AnimatePresence mode="wait">
          {progress.current_ship_name && progress.status === 'running' && (
            <motion.div
              key={progress.current_ship_slug}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg"
            >
              <Ship className="w-5 h-5 text-primary mt-0.5 flex-shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  Processing: {progress.current_ship_name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Slug: {progress.current_ship_slug}
                </p>
              </div>
              <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats Grid */}
        <motion.div 
          className="grid grid-cols-2 gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <motion.div 
            className="p-3 bg-muted/50 rounded-lg transition-colors hover:bg-muted"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-xs text-muted-foreground mb-1">Started</p>
            <p className="text-sm font-medium">
              {formatDistanceToNow(new Date(progress.started_at), { addSuffix: true })}
            </p>
          </motion.div>
          <motion.div 
            className="p-3 bg-muted/50 rounded-lg transition-colors hover:bg-muted"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-xs text-muted-foreground mb-1">Duration</p>
            <motion.p 
              className="text-sm font-medium"
              key={elapsedTime}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {elapsedTime}
            </motion.p>
          </motion.div>
        </motion.div>

        {/* Statistics Cards */}
        {(progress.success_count !== undefined || progress.failed_count !== undefined || progress.skipped_count !== undefined) && (
          <motion.div 
            className="grid grid-cols-3 gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {/* Success Card */}
            <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">Success</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {progress.success_count || 0}
                  </span>
                  <span className="text-xs text-green-600 dark:text-green-400">
                    ({progress.total_items > 0 ? ((progress.success_count || 0) / progress.total_items * 100).toFixed(1) : 0}%)
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Failed Card */}
            <Card className="bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">Failed</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-red-700 dark:text-red-300">
                    {progress.failed_count || 0}
                  </span>
                  <span className="text-xs text-red-600 dark:text-red-400">
                    ({progress.total_items > 0 ? ((progress.failed_count || 0) / progress.total_items * 100).toFixed(1) : 0}%)
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Skipped Card */}
            <Card className="bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  <span className="text-xs font-medium text-orange-600 dark:text-orange-400">Skipped</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                    {progress.skipped_count || 0}
                  </span>
                  <span className="text-xs text-orange-600 dark:text-orange-400">
                    ({progress.total_items > 0 ? ((progress.skipped_count || 0) / progress.total_items * 100).toFixed(1) : 0}%)
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Segmented Progress Bar */}
        {progress.total_items > 0 && (
          <motion.div 
            className="space-y-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="text-xs text-muted-foreground font-medium mb-1">Detailed Progress</div>
            <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex">
              {/* Success segment */}
              <motion.div
                className="bg-green-500 dark:bg-green-600 h-full transition-all duration-500"
                initial={{ width: 0 }}
                animate={{ 
                  width: `${((progress.success_count || 0) / progress.total_items) * 100}%` 
                }}
              />
              {/* Failed segment */}
              <motion.div
                className="bg-red-500 dark:bg-red-600 h-full transition-all duration-500"
                initial={{ width: 0 }}
                animate={{ 
                  width: `${((progress.failed_count || 0) / progress.total_items) * 100}%` 
                }}
              />
              {/* Skipped segment */}
              <motion.div
                className="bg-orange-500 dark:bg-orange-600 h-full transition-all duration-500"
                initial={{ width: 0 }}
                animate={{ 
                  width: `${((progress.skipped_count || 0) / progress.total_items) * 100}%` 
                }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-green-600 dark:text-green-400">
                ✓ {progress.success_count || 0}
              </span>
              <span className="text-red-600 dark:text-red-400">
                ✗ {progress.failed_count || 0}
              </span>
              <span className="text-orange-600 dark:text-orange-400">
                ⏭ {progress.skipped_count || 0}
              </span>
            </div>
          </motion.div>
        )}

        {/* Failed Ships List */}
        {progress.failed_ships && progress.failed_ships.length > 0 && (
          <Collapsible>
            <Card className="border-red-200 dark:border-red-800">
              <CollapsibleTrigger className="w-full">
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-red-500" />
                      Failed Ships ({progress.failed_ships.length})
                    </CardTitle>
                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200" />
                  </div>
                  <CardDescription>
                    Click to view ships that encountered errors during sync
                  </CardDescription>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {progress.failed_ships.map((ship, idx) => (
                      <motion.div
                        key={`${ship.slug}-${idx}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg"
                      >
                        <div className="flex items-start gap-2">
                          <Ship className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                              {ship.name}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Slug: {ship.slug}
                            </p>
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                              Error: {ship.error}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Results Stats */}
        <AnimatePresence>
          {progress.metadata && (progress.metadata.upserts !== undefined || progress.metadata.errors !== undefined) && (
            <motion.div 
              className="grid grid-cols-2 gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {progress.metadata.upserts !== undefined && (
                <motion.div 
                  className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg"
                  whileHover={{ scale: 1.02, borderColor: 'hsl(var(--primary))' }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="text-xs text-green-700 dark:text-green-400 mb-1">Upserted</p>
                  <motion.p 
                    className="text-lg font-bold text-green-600 dark:text-green-500"
                    key={progress.metadata.upserts}
                    initial={{ scale: 1.3 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    {progress.metadata.upserts}
                  </motion.p>
                </motion.div>
              )}
              {progress.metadata.errors !== undefined && progress.metadata.errors > 0 && (
                <motion.div 
                  className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg"
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.2 }}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <p className="text-xs text-red-700 dark:text-red-400 mb-1">Errors</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-500">
                    {progress.metadata.errors}
                  </p>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Message */}
        <AnimatePresence>
          {progress.error_message && (
            <motion.div 
              className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-start gap-2">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-red-600 dark:text-red-400 font-semibold mb-1">Error</p>
                  <p className="text-sm text-red-600 dark:text-red-400">{progress.error_message}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Estimated Time Remaining (only when running) */}
        <AnimatePresence>
          {progress.status === 'running' && progress.current_item > 10 && (
            <motion.div 
              className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-700 dark:text-blue-400">Estimated time remaining</span>
                <motion.span 
                  className="font-medium text-blue-600 dark:text-blue-500"
                  key={progress.current_item}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {(() => {
                    const elapsed = Date.now() - new Date(progress.started_at).getTime();
                    const avgTimePerItem = elapsed / progress.current_item;
                    const remainingItems = progress.total_items - progress.current_item;
                    const estimatedMs = avgTimePerItem * remainingItems;
                    const minutes = Math.floor(estimatedMs / 60000);
                    const seconds = Math.floor((estimatedMs % 60000) / 1000);
                    return minutes > 0 ? `~${minutes}m ${seconds}s` : `~${seconds}s`;
                  })()}
                </motion.span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}