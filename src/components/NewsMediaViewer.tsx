import { useState } from "react";
import { Play, Image as ImageIcon, Volume2 } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface NewsMediaViewerProps {
  mediaType: string;
  mediaUrls: string[];
  imageUrl?: string;
  title: string;
}

export function NewsMediaViewer({
  mediaType,
  mediaUrls = [],
  imageUrl,
  title,
}: NewsMediaViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // For video type
  if (mediaType === "video" && mediaUrls.length > 0) {
    const videoUrl = mediaUrls[0];
    const isYouTube = videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");
    const isVimeo = videoUrl.includes("vimeo.com");

    let embedUrl = videoUrl;
    if (isYouTube) {
      const videoId = videoUrl.split("v=")[1]?.split("&")[0] || videoUrl.split("/").pop();
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (isVimeo) {
      const videoId = videoUrl.split("/").pop();
      embedUrl = `https://player.vimeo.com/video/${videoId}`;
    }

    return (
      <AspectRatio ratio={16 / 9} className="bg-muted">
        <iframe
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full rounded-lg"
        />
      </AspectRatio>
    );
  }

  // For gallery type
  if (mediaType === "gallery" && mediaUrls.length > 0) {
    return (
      <div className="space-y-2">
        <AspectRatio ratio={16 / 9} className="bg-muted">
          <img
            src={mediaUrls[currentIndex]}
            alt={`${title} - Image ${currentIndex + 1}`}
            className="w-full h-full object-cover rounded-lg"
          />
        </AspectRatio>
        {mediaUrls.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {mediaUrls.map((url, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`flex-shrink-0 w-20 h-20 rounded-md overflow-hidden border-2 transition-all ${
                  index === currentIndex
                    ? "border-primary"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <img src={url} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // For audio type
  if (mediaType === "audio" && mediaUrls.length > 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <Volume2 className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <audio controls className="w-full">
              <source src={mediaUrls[0]} />
              Votre navigateur ne supporte pas la lecture audio.
            </audio>
          </div>
        </div>
      </Card>
    );
  }

  // Default: show image or placeholder
  if (imageUrl) {
    return (
      <AspectRatio ratio={16 / 9} className="bg-muted">
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-full object-cover rounded-lg"
          loading="lazy"
        />
      </AspectRatio>
    );
  }

  // No media available
  return (
    <AspectRatio ratio={16 / 9} className="bg-muted flex items-center justify-center">
      <div className="text-center text-muted-foreground">
        <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-20" />
        <p className="text-sm">Aucun média disponible</p>
      </div>
    </AspectRatio>
  );
}
