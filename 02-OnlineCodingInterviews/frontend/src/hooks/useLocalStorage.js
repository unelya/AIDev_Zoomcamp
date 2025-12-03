import { useCallback, useEffect, useState } from 'react';

export const useLocalStorage = (key, defaultValue = '') => {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') {
      return defaultValue;
    }
    const stored = window.localStorage.getItem(key);
    return stored !== null ? JSON.parse(stored) : defaultValue;
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  const updateValue = useCallback(
    (nextValue) => {
      setValue(nextValue);
    },
    [setValue],
  );

  return [value, updateValue];
};
