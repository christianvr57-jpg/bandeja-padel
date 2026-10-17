import type { CategoryView, PairView, SlotView } from '@shared/api';
import { IS_DEMO } from './api';

/** URL pública absoluta de una ruta de la SPA (con # en la demo de GitHub Pages). */
export function absoluteUrl(path: string): string {
  if (IS_DEMO) return `${location.origin}${location.pathname}#${path}`;
  return `${location.origin}${path}`;
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareLink(title: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch {
      /* cancelado por el usuario: se intenta copiar */
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}

export function pairMap(cat: Pick<CategoryView, 'pairs'>): Map<string, PairView> {
  return new Map(cat.pairs.map((p) => [p.id, p]));
}

export function slotNames(slot: SlotView, pairs: Map<string, PairView>): string[] | null {
  if (slot.kind !== 'pair') return null;
  return pairs.get(slot.pairId)?.players ?? ['—'];
}

/** Descarga un Blob como fichero. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reduce una imagen en el navegador (máx. 1200 px, JPEG) para guardarla como data URL ligera. */
export function resizeImage(file: File, maxSize = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      reject(new Error('Formato no admitido: usa JPG, PNG o WebP.'));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se ha podido leer la imagen.'));
    };
    img.src = url;
  });
}

export function euros(cents: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
