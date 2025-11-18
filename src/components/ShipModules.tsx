import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings } from "lucide-react";

interface ShipModulesProps {
  modules: any[];
}

export function ShipModules({ modules }: ShipModulesProps) {
  if (!modules || modules.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Available Modules
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {modules.map((module, index) => (
            <div
              key={index}
              className="rounded-lg border border-border bg-muted p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <p className="font-medium">{module.name}</p>
                {module.type && (
                  <Badge variant="secondary" className="text-xs">
                    {module.type}
                  </Badge>
                )}
              </div>
              {module.description && (
                <p className="mb-2 text-sm text-muted-foreground">
                  {module.description}
                </p>
              )}
              {module.manufacturer && (
                <p className="text-xs text-muted-foreground">
                  Manufacturer: {module.manufacturer}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
