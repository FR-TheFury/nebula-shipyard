import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { GitBranch } from "lucide-react";

interface ShipVariantsProps {
  variants: any[];
}

export function ShipVariants({ variants }: ShipVariantsProps) {
  if (!variants || variants.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Ship Variants
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {variants.map((variant, index) => (
            <div
              key={index}
              className="rounded-lg border border-border bg-muted p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">{variant.name}</p>
                {variant.slug && (
                  <Link
                    to={`/ships/${variant.slug}`}
                    className="text-primary hover:underline"
                  >
                    <Badge variant="outline" className="text-xs">
                      View
                    </Badge>
                  </Link>
                )}
              </div>
              {variant.description && (
                <p className="text-sm text-muted-foreground">
                  {variant.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
