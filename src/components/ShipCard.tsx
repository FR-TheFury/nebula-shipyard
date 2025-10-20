import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import type { Tables } from '@/integrations/supabase/types';

type Ship = Tables<'ships'>;

interface ShipCardProps {
  ship: Ship;
}

export function ShipCard({ ship }: ShipCardProps) {
  return (
    <Link to={`/ships/${ship.slug}`}>
      <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1 bg-card/50 backdrop-blur-sm border-primary/20 hover:border-primary/50">
        {ship.image_url && (
          <div className="aspect-video bg-muted relative overflow-hidden group">
            <img
              src={ship.image_url}
              alt={ship.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}
        <CardHeader>
          <CardTitle className="text-neon-pink">{ship.name}</CardTitle>
          <CardDescription>{ship.manufacturer}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {ship.role && <Badge variant="secondary" className="bg-neon-purple/20 text-neon-purple border-neon-purple/30">{ship.role}</Badge>}
            {ship.size && <Badge variant="outline" className="border-neon-blue/30 text-neon-blue">{ship.size}</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {ship.crew_min && (
              <div className="text-muted-foreground">
                <span className="text-primary">Crew:</span> {ship.crew_min}-{ship.crew_max}
              </div>
            )}
            {ship.cargo_scu && (
              <div className="text-muted-foreground">
                <span className="text-primary">Cargo:</span> {ship.cargo_scu} SCU
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
