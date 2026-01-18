/*
  v2-commands.js
  -------------
  Client-side search for /v2/befehle.
  Filters command cards inside categories.
*/

(() => {
  const input = document.getElementById('v2CommandSearch');
  const root = document.querySelector('[data-v2-commands]');
  if (!input || !root) return;

  const norm = (s) => String(s || '').toLowerCase();

  const cats = Array.from(root.querySelectorAll('[data-v2-category]'));

  const apply = () => {
    const q = norm(input.value).trim();

    // No query -> show all
    if (!q) {
      cats.forEach((cat) => {
        cat.classList.remove('hidden');
        cat
          .querySelectorAll('[data-v2-command]')
          .forEach((item) => item.classList.remove('hidden'));
      });
      return;
    }

    cats.forEach((cat) => {
      const items = Array.from(cat.querySelectorAll('[data-v2-command]'));
      let visible = 0;

      items.forEach((item) => {
        const hay = norm(item.getAttribute('data-search'));
        const ok = hay.includes(q);
        if (ok) {
          item.classList.remove('hidden');
          visible++;
        } else {
          item.classList.add('hidden');
        }
      });

      // Hide empty categories
      if (visible === 0) cat.classList.add('hidden');
      else cat.classList.remove('hidden');

      // keep categories open while searching
      const details = cat.closest('details');
      if (details) details.open = visible > 0;
    });
  };

  input.addEventListener('input', apply);
})();
