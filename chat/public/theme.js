/* Applies the saved theme before first paint so there is no flash. */
(() => {
  let pref = 'system';
  try { pref = localStorage.getItem('lq.theme') || 'system'; } catch { /* private mode */ }
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
