/*
  app-commands.js
  -------------
  Client-side search for /befehle.
  Filters command cards inside categories.
*/

(() => {
  const input = document.getElementById('commandSearch');
  const root = document.querySelector('[data-commands]');
  if (!input || !root) return;

  const norm = (s) => String(s || '').toLowerCase();

  const cats = Array.from(root.querySelectorAll('[data-category]'));

  const apply = () => {
    const q = norm(input.value).trim();

    // No query -> show all
    if (!q) {
      cats.forEach((cat) => {
        cat.classList.remove('hidden');
        cat.querySelectorAll('[data-command]').forEach((item) => item.classList.remove('hidden'));
      });
      return;
    }

    cats.forEach((cat) => {
      const items = Array.from(cat.querySelectorAll('[data-command]'));
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
