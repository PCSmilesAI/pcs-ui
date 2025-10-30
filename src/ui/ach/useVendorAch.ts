import { useEffect, useMemo, useState } from 'react';

export type AchStatus = 'complete' | 'pending' | 'missing' | undefined;

type VendorEntry = {
  stripeAccountId?: string;
  ach_status?: 'complete' | 'pending' | 'missing';
  aliases?: string[];
};

type VendorMapResponse = {
  vendors: Record<string, VendorEntry>;
  version?: string | number;
  path?: string;
};

function normalize(name: string | undefined | null) {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function fetchVendorStatus(): Promise<VendorMapResponse> {
  const res = await fetch('/api/vendors/status', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch vendor status: ${res.status}`);
  const json = await res.json();
  return json;
}

export function useVendorAchMap() {
  const [data, setData] = useState<VendorMapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setIsLoading(true);
        const json = await fetchVendorStatus();
        if (active) setData(json);
      } catch (e: any) {
        if (active) setError(e?.message || 'Failed to load vendor status');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const index = useMemo(() => {
    const map = new Map<string, VendorEntry>();
    if (data?.vendors) {
      for (const [name, entry] of Object.entries(data.vendors)) {
        const key = normalize(name);
        if (key) map.set(key, entry);
        if (Array.isArray(entry.aliases)) {
          entry.aliases.forEach(alias => {
            const akey = normalize(alias);
            if (akey) map.set(akey, entry);
          });
        }
      }
    }
    return map;
  }, [data]);

  function getStatusForVendor(name: string | undefined | null): AchStatus {
    const key = normalize(name);
    const entry = index.get(key);
    return entry?.ach_status || undefined;
  }

  return {
    isLoading,
    error,
    getStatusForVendor,
    vendors: data?.vendors || {},
    version: data?.version,
    path: data?.path,
    refetch: async () => {
      try {
        setIsLoading(true);
        const json = await fetchVendorStatus();
        setData(json);
        setError(null);
      } catch (e: any) {
        setError(e?.message || 'Failed to reload vendor status');
      } finally {
        setIsLoading(false);
      }
    }
  };
}




