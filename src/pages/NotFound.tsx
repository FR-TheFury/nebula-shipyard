import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Rocket } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <Rocket className="w-24 h-24 text-primary" />
        </div>
        <h1 className="text-6xl font-bold">404</h1>
        <p className="text-2xl text-muted-foreground">Lost in space</p>
        <p className="text-muted-foreground">
          The page you're looking for doesn't exist in this sector of the verse.
        </p>
        <Link to="/">
          <Button size="lg">Return to Base</Button>
        </Link>
      </div>
    </div>
  );
}
