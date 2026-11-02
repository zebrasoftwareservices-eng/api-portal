// SPDX-License-Identifier: Apache-2.0
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Problem } from '../lib/types';
import { networkProblem } from '../lib/client';
export function useResource<T>(
  load: () => Promise<{ data?: T; error?: Problem }>,
) {
  const loader = useRef(load);
  loader.current = load;
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Problem>();
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await loader.current();
      if (mounted.current) {
        setData(result.data);
        setError(result.error);
      }
    } catch {
      if (mounted.current) setError(networkProblem());
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);
  return { data, error, loading, reload, setData };
}
