const PYODIDE_VERSION = '0.26.2';
const PYODIDE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_SCRIPT_URL = `${PYODIDE_BASE_URL}pyodide.js`;

let scriptPromise;
let pyodidePromise;

const injectScript = () => {
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const scope = typeof window !== 'undefined' ? window : globalThis;
    if (!scope?.document) {
      reject(new Error('Pyodide requires a browser environment to load.'));
      return;
    }

    if (typeof scope.loadPyodide === 'function') {
      resolve();
      return;
    }

    const script = scope.document.createElement('script');
    script.src = PYODIDE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to download the Pyodide runtime.'));
    scope.document.head.appendChild(script);
  });

  return scriptPromise;
};

export const ensurePyodide = async () => {
  if (pyodidePromise) {
    return pyodidePromise;
  }

  pyodidePromise = (async () => {
    const scope = typeof window !== 'undefined' ? window : globalThis;

    if (typeof scope.loadPyodide !== 'function') {
      await injectScript();
    }

    if (typeof scope.loadPyodide !== 'function') {
      throw new Error('Pyodide loader unavailable after script injection.');
    }

    return scope.loadPyodide({
      indexURL: PYODIDE_BASE_URL,
    });
  })();

  return pyodidePromise;
};
