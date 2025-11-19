import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tag } from "lucide-react";

interface ShipTagsProps {
  fullData: any;
}

export function ShipTags({ fullData }: ShipTagsProps) {
  if (!fullData) return null;

  const tags: string[] = [];

  // Extract tags from FleetYards full data
  if (fullData.classification) tags.push(fullData.classification);
  if (fullData.focus) tags.push(fullData.focus);
  if (fullData.size) tags.push(`Size: ${fullData.size}`);
  if (fullData.productionStatus) tags.push(fullData.productionStatus);
  if (fullData.onSale !== undefined) {
    tags.push(fullData.onSale ? "On Sale" : "Not on Sale");
  }

  // Add manufacturer tag
  if (fullData.manufacturer?.name) {
    tags.push(fullData.manufacturer.name);
  }

  if (tags.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Ship Tags
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, idx) => (
            <Badge key={idx} variant="secondary" className="text-sm">
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
