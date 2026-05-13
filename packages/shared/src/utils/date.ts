import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatGermanDate(iso: string): string {
  return format(new Date(iso), "EEEE, d. MMMM yyyy 'um' HH:mm 'Uhr'", { locale: de });
}

export function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '–';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours} h ${minutes.toString().padStart(2, '0')} min`;
  }
  if (minutes > 0) {
    return `${minutes} min ${seconds.toString().padStart(2, '0')} s`;
  }
  return `${seconds} s`;
}
