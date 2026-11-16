import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs an async function and exposes { data, error, loading, retry, setData }.
 * A slow older response can never overwrite a newer one, and nothing is set
 * after unmount.
 *
 * @param {() => Promise<any>} fn      the call to make
 * @param {any[]} deps                 re-run when these change
 * @param {{ immediate?: boolean }} [options]
 */
export function useApi(fn, deps = [], { immediate = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: immediate });
  const run = useRef(0);
  const mounted = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const execute = useCallback(async () => {
    const id = ++run.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (mounted.current && id === run.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (mounted.current && id === run.current) setState((s) => ({ data: s.data, error, loading: false }));
      return null;
    }
  }, []);

  useEffect(() => {
    if (immediate) execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === "function" ? updater(s.data) : updater }));
  }, []);

  return { ...state, retry: execute, setData };
}
