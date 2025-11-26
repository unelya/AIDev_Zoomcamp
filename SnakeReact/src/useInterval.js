import { useEffect, useRef } from 'react';

export default function useInterval(callback, delay) {
  const savedCb = useRef();

  useEffect(() => {
    savedCb.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) {
      return undefined;
    }

    const id = setInterval(() => {
      savedCb.current?.();
    }, delay);

    return () => clearInterval(id);
  }, [delay]);
}
