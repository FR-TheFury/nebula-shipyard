import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <Rocket className="w-24 h-24 text-primary" />
        </div>
        <h1 className="text-6xl font-bold">404</h1>
        <p className="text-2xl text-muted-foreground">{t('errors.notFound')}</p>
        <p className="text-muted-foreground">
          {t('home.subtitle')}
        </p>
        <Link to="/">
          <Button size="lg">{t('common.back')}</Button>
        </Link>
      </div>
    </div>
  );
}
