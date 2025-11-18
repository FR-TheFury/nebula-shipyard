import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

interface ShipLoanersProps {
  loaners: any[];
}

export function ShipLoaners({ loaners }: ShipLoanersProps) {
  if (!loaners || loaners.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ExternalLink className="h-5 w-5" />
          Loaner Ships
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {loaners.map((loaner, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded-lg border border-border bg-muted p-3"
            >
              <div>
                <p className="font-medium">{loaner.name}</p>
                {loaner.manufacturer && (
                  <p className="text-sm text-muted-foreground">
                    {loaner.manufacturer}
                  </p>
                )}
              </div>
              {loaner.slug && (
                <Link
                  to={`/ships/${loaner.slug}`}
                  className="text-primary hover:underline"
                >
                  <Badge variant="outline">View</Badge>
                </Link>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
