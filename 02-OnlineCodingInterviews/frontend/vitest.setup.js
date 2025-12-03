import '@testing-library/jest-dom/vitest';
import 'whatwg-fetch';

if (typeof document !== 'undefined' && typeof document.queryCommandSupported !== 'function') {
  document.queryCommandSupported = () => false;
}
