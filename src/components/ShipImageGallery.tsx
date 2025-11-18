import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image as ImageIcon } from "lucide-react";

interface ShipImageGalleryProps {
  images: any[];
}

export function ShipImageGallery({ images }: ShipImageGalleryProps) {
  if (!images || images.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          FleetYards Images
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((image, index) => (
            <a
              key={index}
              href={image.bigUrl || image.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-video overflow-hidden rounded-lg border border-border bg-muted transition-all hover:border-primary hover:shadow-lg"
            >
              <img
                src={image.smallUrl || image.url}
                alt={image.name || `Ship image ${index + 1}`}
                className="h-full w-full object-cover transition-transform group-hover:scale-110"
                loading="lazy"
              />
              {image.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-xs text-white">
                  {image.caption}
                </div>
              )}
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
