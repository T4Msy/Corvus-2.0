"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/integrations/supabase/client";
import {
  createAttachmentSignedUrl,
  isStoragePath,
} from "@/integrations/supabase/storage";

export function useStorageUrl(
  value: string | null | undefined,
  enabled: boolean
) {
  const [url, setUrl] = useState<string | null>(value ?? null);

  useEffect(() => {
    let cancelled = false;

    if (!value) {
      setUrl(null);
      return;
    }

    if (!isStoragePath(value)) {
      setUrl(value);
      return;
    }

    if (!enabled) {
      setUrl(null);
      return;
    }

    setUrl(null);
    void createAttachmentSignedUrl(getBrowserSupabase(), value)
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, value]);

  return url;
}
