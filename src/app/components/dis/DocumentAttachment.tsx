'use client';
import { disRequest } from '@/lib/dis/api-client';
import { useEffect, useState } from 'react';
export function DocumentAttachment({
  src,
  label,
  image = false,
}: {
  src: string;
  label: string;
  image?: boolean;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const controller = new AbortController();
    disRequest(src, { signal: controller.signal })
      .then((response) => response.blob())
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  if (error) return <span className="text-red-700">Príloha sa nedá načítať: {label}</span>;
  if (!url) return <span>Načítavam prílohu...</span>;
  // Object URLs represent authenticated, validated uploads from our attachment endpoint.
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={label} className="max-w-full" />
  ) : (
    <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
      {label}
    </a>
  );
}
