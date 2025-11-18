import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video } from "lucide-react";

interface ShipVideosProps {
  videos: any[];
}

export function ShipVideos({ videos }: ShipVideosProps) {
  if (!videos || videos.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          FleetYards Videos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          {videos.map((video, index) => (
            <a
              key={index}
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-lg border border-border bg-muted p-4 transition-all hover:border-primary hover:bg-muted/80"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Video className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="font-medium group-hover:text-primary">
                  {video.title || `Video ${index + 1}`}
                </p>
                {video.type && (
                  <p className="text-sm text-muted-foreground">{video.type}</p>
                )}
              </div>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
