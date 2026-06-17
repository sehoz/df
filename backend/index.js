exports.main = async (event, context) => {
  const mod = await import('./dist/index.js');
  return mod.main_handler(event, context);
};
