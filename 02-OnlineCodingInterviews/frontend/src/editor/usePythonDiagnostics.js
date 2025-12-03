import { loader } from '@monaco-editor/react';
import { useEffect } from 'react';
import { ensureSkulpt } from '../utils/skulptLoader';

const OWNER = 'python-diagnostics';
const DIAGNOSTIC_DELAY = 400;
const EXEC_LIMIT = 100000;

const parseLineFromMessage = (error) => {
  const text = error?.toString?.();
  if (!text) {
    return null;
  }
  const match = text.match(/line (\d+)/i);
  return match ? Number(match[1]) : null;
};

const extractPosition = (error) => {
  const frames = error?.traceback;
  const traceback = Array.isArray(frames) && frames.length ? frames[0] : undefined;
  if (traceback) {
    return {
      line: traceback.lineno || 1,
      column: traceback.colno || 1,
    };
  }
  const tuple = error?.args?.v?.[2]?.v || [];
  const lineFromMessage = parseLineFromMessage(error);
  return {
    line: lineFromMessage || tuple[0] || 1,
    column: tuple[1] || 1,
  };
};

const normalizePosition = ({ line, column }) => ({
  line: Math.max(1, line || 1),
  column: Math.max(1, column || 1),
});

const createMarker = (monaco, position, message) => {
  const normalized = normalizePosition(position);
  return {
    startLineNumber: normalized.line,
    startColumn: normalized.column,
    endLineNumber: normalized.line,
    endColumn: normalized.column + 1,
    message,
    severity: monaco.MarkerSeverity.Error,
  };
};

const clearMarkers = (monaco, model) => {
  monaco.editor.setModelMarkers(model, OWNER, []);
};

const applyMarker = (monaco, model, marker) => {
  monaco.editor.setModelMarkers(model, OWNER, marker ? [marker] : []);
};

const getLineContent = (code, lineNumber) => {
  const lines = code.split(/\r?\n/);
  return lines[Math.max(0, lineNumber - 1)] || '';
};

const refinePositionFromMessage = (position, message, code) => {
  if (typeof message !== 'string') {
    return position;
  }
  const nameMatch = message.match(/name '([^']+)' is not defined/);
  if (!nameMatch) {
    return position;
  }
  const identifier = nameMatch[1];
  const lineContent = getLineContent(code, position.line);
  const index = lineContent.indexOf(identifier);
  if (index === -1) {
    return position;
  }
  return { line: position.line, column: index + 1 };
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

    const shouldRetry = (message) => typeof message === 'string' && message.includes('Sk is not defined');

    const scheduleDiagnostics = () => {
      if (disposed) {
        return;
      }
      clearTimeout(timeout);
      timeout = setTimeout(runDiagnostics, DIAGNOSTIC_DELAY);
    };

    const runDiagnostics = async () => {
      const editor = editorRef.current;
      if (!editor) {
        scheduleDiagnostics();
        return;
      }
      const model = editor.getModel();
      if (!model) {
        scheduleDiagnostics();
        return;
      }
      const monaco = await loader.init();

      if (language !== 'python' || !code.trim()) {
        clearMarkers(monaco, model);
        return;
      }

      let Sk;
      try {
        Sk = await ensureSkulpt();
      } catch (loadError) {
        if (!disposed && shouldRetry(loadError?.message || loadError?.toString?.())) {
          scheduleDiagnostics();
        }
        return;
      }

      try {
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
          const message = runtimeError?.toString?.() || 'Python runtime error';
          if (shouldRetry(message)) {
            scheduleDiagnostics();
            return;
          }
          const position = extractPosition(runtimeError);
          const refinedPosition = refinePositionFromMessage(position, message, code);
          applyMarker(monaco, model, createMarker(monaco, refinedPosition, message));
        }
      } catch (syntaxError) {
        if (disposed) {
          return;
        }
        const message = syntaxError?.toString?.() || 'Invalid Python syntax';
        if (shouldRetry(message)) {
          scheduleDiagnostics();
          return;
        }
        const position = extractPosition(syntaxError);
        const refinedPosition = refinePositionFromMessage(position, message, code);
        applyMarker(monaco, model, createMarker(monaco, refinedPosition, message));
      }
    };

    scheduleDiagnostics();

    return () => {
      disposed = true;
      clearTimeout(timeout);
    };
  }, [editorRef, language, code]);
};
