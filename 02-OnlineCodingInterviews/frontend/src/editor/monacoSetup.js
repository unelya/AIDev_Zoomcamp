import { loader } from '@monaco-editor/react';
import { conf as pythonConf, language as pythonLanguage } from 'monaco-editor/esm/vs/basic-languages/python/python';
import { conf as jsConf, language as jsLanguage } from 'monaco-editor/esm/vs/basic-languages/javascript/javascript';

let setupPromise;

export const ensureMonacoSetup = () => {
  if (!setupPromise) {
    setupPromise = loader.init().then((monaco) => {
      const registerLanguage = (id, conf, language) => {
        if (!monaco.languages.getLanguages().some((lang) => lang.id === id)) {
          monaco.languages.register({ id });
        }
        monaco.languages.setLanguageConfiguration(id, conf);
        monaco.languages.setMonarchTokensProvider(id, language);
      };

      registerLanguage('javascript', jsConf, jsLanguage);
      registerLanguage('python', pythonConf, pythonLanguage);

      return monaco;
    });
  }
  return setupPromise;
};
