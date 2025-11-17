import { formatDistanceToNow, format } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Format news date with relative time for recent items (<24h)
 * @param date - ISO date string
 * @returns Formatted date string
 */
export function formatNewsDate(date: string): string {
  const now = new Date();
  const publishDate = new Date(date);
  const diffInHours = (now.getTime() - publishDate.getTime()) / (1000 * 60 * 60);
  
  // If less than 24h: relative format (e.g., "il y a 2 heures")
  if (diffInHours < 24) {
    return formatDistanceToNow(publishDate, { addSuffix: true, locale: fr });
  }
  
  // Otherwise: classic format (e.g., "17 Nov 2025")
  return format(publishDate, 'd MMM yyyy', { locale: fr });
}
