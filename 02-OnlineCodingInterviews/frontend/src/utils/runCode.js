import { ensurePyodide } from './pyodideLoader';

const EXECUTION_TIMEOUT_MS = 4000;

const runJavaScriptInWorker = (code) =>
  new Promise((resolve) => {
    const workerSource = `
      self.onmessage = (event) => {
        const { code } = event.data;
        const logs = [];
        const proxyConsole = {
          log: (...args) => logs.push(args.join(' ')),
          error: (...args) => logs.push(args.join(' ')),
        };
        try {
          const fn = new Function('console', code);
          const result = fn(proxyConsole);
          if (result !== undefined) {
            logs.push(String(result));
          }
          self.postMessage({ status: 'success', output: logs.join('\\n') });
        } catch (err) {
          self.postMessage({ status: 'error', error: err?.stack || err?.message || String(err) });
        }
      };
    `;
    const blob = new Blob([workerSource], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    const timeout = setTimeout(() => {
      worker.terminate();
      resolve({ error: `Execution timed out after ${EXECUTION_TIMEOUT_MS}ms` });
    }, EXECUTION_TIMEOUT_MS);

    worker.onmessage = (event) => {
      clearTimeout(timeout);
      worker.terminate();
      if (event.data.status === 'success') {
        resolve({ output: event.data.output || 'Execution completed with no output' });
      } else {
        resolve({ error: event.data.error });
      }
    };

    worker.postMessage({ code });
  });

const transpileTypeScript = async (code) => {
  const tsModule = await import('typescript');
  const ts = tsModule.default || tsModule;
  const output = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2017,
    },
  });
  return output.outputText;
};

const runPython = async (code) => {
  try {
    const pyodide = await ensurePyodide();
    await pyodide.loadPackagesFromImports(code);
    pyodide.globals.set('__oci_code__', code);

    let result;
    try {
      result = await pyodide.runPythonAsync(`
import sys, io, traceback
stdout_buffer = io.StringIO()
stderr_buffer = io.StringIO()
_stdout, _stderr = sys.stdout, sys.stderr
sys.stdout = stdout_buffer
sys.stderr = stderr_buffer
error_text = ""
try:
    exec(__oci_code__, {"__name__": "__main__"})
except Exception:
    error_text = traceback.format_exc()
finally:
    sys.stdout = _stdout
    sys.stderr = _stderr
{"stdout": stdout_buffer.getvalue(), "stderr": stderr_buffer.getvalue(), "error": error_text}
`);
    } finally {
      pyodide.globals.delete('__oci_code__');
    }

    const normalized = result.toJs({ create_proxies: false });
    result.destroy?.();

    const stdoutText = normalized.stdout || '';
    const stderrText = normalized.stderr || '';
    const errorText = (normalized.error || '').trim();

    return {
      output: stdoutText || (!errorText && !stderrText ? 'Execution completed with no output' : stdoutText),
      error: errorText || stderrText,
    };
  } catch (error) {
    return {
      output: '',
      error: error?.message || 'Python runtime is unavailable right now.',
    };
  }
};

export const runCode = async (language, code) => {
  if (language === 'javascript') {
    return runJavaScriptInWorker(code);
  }

  if (language === 'typescript') {
    const js = await transpileTypeScript(code);
    return runJavaScriptInWorker(js);
  }

  if (language === 'python') {
    return runPython(code);
  }

  return { error: `Execution is not available for ${language} yet.` };
};
