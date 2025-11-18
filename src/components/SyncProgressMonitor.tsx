import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock, Ship } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
}

export function SyncProgressMonitor({ functionName = 'ships-sync' }: { functionName?: string }) {
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
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const elapsedTime = progress.completed_at 
    ? formatDuration(progress.duration_ms)
    : formatDistanceToNow(new Date(progress.started_at), { addSuffix: false });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            Ship Sync Progress
          </div>
          {getStatusBadge()}
        </CardTitle>
        <CardDescription>
          {progress.status === 'running' && 'Synchronization in progress...'}
          {progress.status === 'completed' && `Completed ${formatDistanceToNow(new Date(progress.completed_at!))} ago`}
          {progress.status === 'failed' && 'Synchronization failed'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground font-medium">Overall Progress</span>
            <span className="font-bold text-lg">
              {progress.progress_percent.toFixed(1)}%
            </span>
          </div>
          <Progress value={progress.progress_percent} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.current_item} processed</span>
            <span>{progress.total_items} total ships</span>
          </div>
        </div>

        {/* Current Ship Processing */}
        {progress.current_ship_name && progress.status === 'running' && (
          <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg animate-pulse">
            <Ship className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                Processing: {progress.current_ship_name}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Slug: {progress.current_ship_slug}
              </p>
            </div>
            <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Started</p>
            <p className="text-sm font-medium">
              {formatDistanceToNow(new Date(progress.started_at), { addSuffix: true })}
            </p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Duration</p>
            <p className="text-sm font-medium">{elapsedTime}</p>
          </div>
        </div>

        {/* Results Stats */}
        {progress.metadata && (progress.metadata.upserts !== undefined || progress.metadata.errors !== undefined) && (
          <div className="grid grid-cols-2 gap-3">
            {progress.metadata.upserts !== undefined && (
              <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
                <p className="text-xs text-green-700 dark:text-green-400 mb-1">Upserted</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-500">
                  {progress.metadata.upserts}
                </p>
              </div>
            )}
            {progress.metadata.errors !== undefined && progress.metadata.errors > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                <p className="text-xs text-red-700 dark:text-red-400 mb-1">Errors</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-500">
                  {progress.metadata.errors}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {progress.error_message && (
          <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
            <div className="flex items-start gap-2">
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-600 dark:text-red-400 font-semibold mb-1">Error</p>
                <p className="text-sm text-red-600 dark:text-red-400">{progress.error_message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Estimated Time Remaining (only when running) */}
        {progress.status === 'running' && progress.current_item > 10 && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-700 dark:text-blue-400">Estimated time remaining</span>
              <span className="font-medium text-blue-600 dark:text-blue-500">
                {(() => {
                  const elapsed = Date.now() - new Date(progress.started_at).getTime();
                  const avgTimePerItem = elapsed / progress.current_item;
                  const remainingItems = progress.total_items - progress.current_item;
                  const estimatedMs = avgTimePerItem * remainingItems;
                  const minutes = Math.floor(estimatedMs / 60000);
                  const seconds = Math.floor((estimatedMs % 60000) / 1000);
                  return minutes > 0 ? `~${minutes}m ${seconds}s` : `~${seconds}s`;
                })()}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}