import { Copy, Share2 } from 'lucide-react';
import { copyText, shareLink, whatsappUrl } from '../lib/util';
import { useFeedback } from './feedback';
import { Button, cx } from './ui';

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.94.95-3.48-.22-.36a9.42 9.42 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.45-9.44 2.52 0 4.89.99 6.67 2.77a9.38 9.38 0 0 1 2.76 6.68c0 5.2-4.24 9.43-9.45 9.43zm8.04-17.47A11.3 11.3 0 0 0 12.04.7C5.77.7.67 5.8.67 12.07c0 2 .52 3.96 1.52 5.69L.57 23.7l6.08-1.6a11.33 11.33 0 0 0 5.4 1.38h.01c6.27 0 11.37-5.1 11.37-11.37 0-3.04-1.18-5.9-3.33-8.04z" />
    </svg>
  );
}

export function ShareButtons({ title, url, text, compact }: { title: string; url: string; text: string; compact?: boolean }) {
  const { toast } = useFeedback();
  return (
    <div className={cx('flex flex-wrap gap-2', compact && 'gap-1.5')}>
      <a
        href={whatsappUrl(`${text}\n${url}`)}
        target="_blank"
        rel="noreferrer"
        className={cx(
          'inline-flex items-center justify-center gap-1.5 whitespace-nowrap bg-[#1fa855] font-semibold text-white shadow-sm transition-colors hover:bg-[#178c46]',
          compact ? 'h-8 rounded-lg px-3 text-sm' : 'h-10 rounded-xl px-4 text-sm',
        )}
      >
        <WhatsAppIcon className="size-4" /> WhatsApp
      </a>
      <Button
        variant="secondary"
        size={compact ? 'sm' : 'md'}
        icon={<Copy className="size-4" />}
        onClick={async () => toast((await copyText(url)) ? 'Enlace copiado' : 'No se pudo copiar', 'success')}
      >
        Copiar enlace
      </Button>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <Button
          variant="secondary"
          size={compact ? 'sm' : 'md'}
          icon={<Share2 className="size-4" />}
          onClick={async () => {
            const r = await shareLink(title, url);
            if (r === 'copied') toast('Enlace copiado');
          }}
        >
          Compartir
        </Button>
      )}
    </div>
  );
}
