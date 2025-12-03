import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import monacoEditorPluginImport from 'vite-plugin-monaco-editor';
const monacoEditorPlugin = monacoEditorPluginImport.default ?? monacoEditorPluginImport;

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    monacoEditorPlugin({
      languageWorkers: ['editorWorkerService', 'typescript', 'json', 'css', 'html'],
    }),
  ],
});
