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
      
      if (error) throw error;
      return data?.[0] as SyncProgress | null;
    },
    refetchInterval: (query) => {
      // Refetch every 2 seconds if running, otherwise every 30 seconds
      return query.state.data?.status === 'running' ? 2000 : 30000;
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
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No sync data available</p>
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
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {progress.current_item} / {progress.total_items} ships ({progress.progress_percent.toFixed(1)}%)
            </span>
          </div>
          <Progress value={progress.progress_percent} className="h-2" />
        </div>

        {progress.current_ship_name && progress.status === 'running' && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <Ship className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">{progress.current_ship_name}</p>
              <p className="text-xs text-muted-foreground">{progress.current_ship_slug}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Started</p>
            <p className="font-medium">
              {formatDistanceToNow(new Date(progress.started_at), { addSuffix: true })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium">{elapsedTime}</p>
          </div>
        </div>

        {progress.metadata && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            {progress.metadata.upserts !== undefined && (
              <div>
                <p className="text-muted-foreground">Upserted</p>
                <p className="font-medium text-green-600">{progress.metadata.upserts}</p>
              </div>
            )}
            {progress.metadata.errors !== undefined && progress.metadata.errors > 0 && (
              <div>
                <p className="text-muted-foreground">Errors</p>
                <p className="font-medium text-red-600">{progress.metadata.errors}</p>
              </div>
            )}
          </div>
        )}

        {progress.error_message && (
          <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">Error:</p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">{progress.error_message}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}