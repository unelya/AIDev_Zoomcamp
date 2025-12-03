import { loader } from '@monaco-editor/react';
import { useEffect } from 'react';
import { ensureSkulpt } from '../utils/skulptLoader';

const OWNER = 'python-diagnostics';
const DIAGNOSTIC_DELAY = 400;
const EXEC_LIMIT = 100000;

const extractPosition = (error) => {
  const traceback = error?.traceback?.[0];
  if (traceback) {
    return {
      line: traceback.lineno || 1,
      column: traceback.colno || 1,
    };
  }
  const tuple = error?.args?.v?.[2]?.v || [];
  return {
    line: tuple[0] || 1,
    column: tuple[1] || 1,
  };
};

const createMarker = (monaco, position, message) => ({
  startLineNumber: position.line,
  startColumn: position.column,
  endLineNumber: position.line,
  endColumn: position.column + 1,
  message,
  severity: monaco.MarkerSeverity.Error,
});

const clearMarkers = (monaco, model) => {
  monaco.editor.setModelMarkers(model, OWNER, []);
};

const applyMarker = (monaco, model, marker) => {
  monaco.editor.setModelMarkers(model, OWNER, marker ? [marker] : []);
};

const createBuiltinReader = (Sk) => (filename) => {
  const path = `src/lib/${filename}`;
  if (Sk.builtinFiles === undefined || Sk.builtinFiles.files[path] === undefined) {
    throw new Error(`File not found: ${filename}`);
  }
  return Sk.builtinFiles.files[path];
};

const runSemanticCheck = async (Sk, code) => {
  const builtinRead = createBuiltinReader(Sk);
  Sk.configure({
    output: () => {},
    read: builtinRead,
    inputfun: () => {
      throw new Error('Interactive input is not supported in diagnostics.');
    },
    inputfunTakesPrompt: true,
  });
  Sk.execLimit = EXEC_LIMIT;
  return Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('<stdin>', false, code, true));
};

export const usePythonDiagnostics = (editorRef, language, code) => {
  useEffect(() => {
    let disposed = false;
    let timeout;

    const scheduleDiagnostics = () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        const editor = editorRef.current;
        if (!editor) {
          return;
        }
        const model = editor.getModel();
        if (!model) {
          return;
        }
        const monaco = await loader.init();

        if (language !== 'python' || !code.trim()) {
          clearMarkers(monaco, model);
          return;
        }

        try {
          const Sk = await ensureSkulpt();
          Sk.compile(code, '<stdin>', 'exec');
          try {
            await runSemanticCheck(Sk, code);
            if (!disposed) {
              clearMarkers(monaco, model);
            }
          } catch (runtimeError) {
            if (disposed) {
              return;
            }
            const position = extractPosition(runtimeError);
            applyMarker(monaco, model, createMarker(monaco, position, runtimeError.toString()));
          }
        } catch (syntaxError) {
          if (disposed) {
            return;
          }
          const position = extractPosition(syntaxError);
          applyMarker(
            monaco,
            model,
            createMarker(monaco, position, syntaxError?.toString() || 'Invalid Python syntax'),
          );
        }
      }, DIAGNOSTIC_DELAY);
    };

    scheduleDiagnostics();

    return () => {
      disposed = true;
      clearTimeout(timeout);
    };
  }, [editorRef, language, code]);
};
