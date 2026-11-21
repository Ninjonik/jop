import { installDesktopDownloads, isTauri, listenDesktopLinks } from '@/lib/desktop';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DesktopBridge() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const stopDownloads = installDesktopDownloads();
    void listenDesktopLinks((path) => navigate(path, { replace: true }))
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => setError('Prihlásenie sa nepodarilo pripraviť. Reštartujte aplikáciu.'));
    return () => {
      disposed = true;
      unlisten?.();
      stopDownloads();
    };
  }, [navigate]);
  return error ? (
    <div role="alert" className="aero-status-bar">
      {error}
    </div>
  ) : null;
}
