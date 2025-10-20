import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function Ships() {
  const { data: ships, isLoading } = useQuery({
    queryKey: ['ships'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ships')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-4xl font-bold">Ships</h1>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-48 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold mb-2">Ships</h1>
        <p className="text-muted-foreground">Explore the Star Citizen ship database</p>
      </div>

      {ships && ships.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No ships in database yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ships?.map((ship) => (
            <Card key={ship.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              {ship.image_url && (
                <div className="aspect-video bg-muted">
                  <img
                    src={ship.image_url}
                    alt={ship.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <CardHeader>
                <CardTitle>{ship.name}</CardTitle>
                <CardDescription>{ship.manufacturer}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {ship.role && <Badge variant="secondary">{ship.role}</Badge>}
                  {ship.size && <Badge variant="outline">{ship.size}</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {ship.crew_min && (
                    <div>
                      <span className="text-muted-foreground">Crew:</span> {ship.crew_min}-{ship.crew_max}
                    </div>
                  )}
                  {ship.cargo_scu && (
                    <div>
                      <span className="text-muted-foreground">Cargo:</span> {ship.cargo_scu} SCU
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
