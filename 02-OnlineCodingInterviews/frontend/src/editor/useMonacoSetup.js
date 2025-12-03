import { useEffect } from 'react';
import { ensureMonacoSetup } from './monacoSetup';

export const useMonacoSetup = () => {
  useEffect(() => {
    ensureMonacoSetup();
  }, []);
};
