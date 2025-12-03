let skulptLoader;

export const ensureSkulpt = () => {
  if (!skulptLoader) {
    skulptLoader = Promise.all([
      import('skulpt/dist/skulpt.min.js'),
      import('skulpt/dist/skulpt-stdlib.js'),
    ]).then(() => window.Sk);
  }
  return skulptLoader;
};
