const EXECUTION_TIMEOUT_MS = 4000;

let skulptLoader;

const ensureSkulpt = async () => {
  if (!skulptLoader) {
    skulptLoader = Promise.all([
      import('skulpt/dist/skulpt.min.js'),
      import('skulpt/dist/skulpt-stdlib.js'),
    ]).then(() => window.Sk);
  }
  return skulptLoader;
};

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
  const Sk = await ensureSkulpt();
  let output = '';
  const builtinRead = (filename) => {
    const path = `src/lib/${filename}`;
    if (Sk.builtinFiles === undefined || Sk.builtinFiles.files[path] === undefined) {
      throw new Error(`File not found: ${filename}`);
    }
    return Sk.builtinFiles.files[path];
  };

  Sk.configure({
    output: (text) => {
      output += text;
    },
    read: builtinRead,
  });

  try {
    await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('<stdin>', false, code, true));
    return { output: output || 'Execution completed with no output' };
  } catch (error) {
    return { output, error: error.toString() };
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
