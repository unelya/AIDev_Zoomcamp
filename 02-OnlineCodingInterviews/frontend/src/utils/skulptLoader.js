let skulptLoader;

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-skulpt="${src}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      if (existing.dataset.loaded === 'true') {
        resolve();
      }
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.skulpt = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', reject);
    document.body.appendChild(script);
  });

const SKULPT_CDN = 'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/';

export const ensureSkulpt = () => {
  if (!skulptLoader) {
    if (typeof window !== 'undefined') {
      window.Sk = window.Sk || {};
    }
    skulptLoader = loadScript(`${SKULPT_CDN}skulpt.min.js`)
      .then(() => loadScript(`${SKULPT_CDN}skulpt-stdlib.js`))
      .then(() => window.Sk);
  }
  return skulptLoader;
};
