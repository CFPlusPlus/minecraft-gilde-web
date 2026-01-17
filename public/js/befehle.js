/*
  befehle.js — Befehle-Seite
  -------------------------
  Enthält:
  - Suche (Filter) für die Befehle-Tabelle
  - Mobile: Tap auf Zeile zeigt Beschreibung als Extra-Zeile
*/

(() => {
  const input = document.getElementById('searchInput');
  const table = document.getElementById('commandsTable');
  if (!input || !table) return;

  const tbody = table.querySelector('tbody');

  const removeDescriptionRows = () => {
    if (!tbody) return;
    tbody.querySelectorAll('tr.description-row').forEach((row) => row.remove());
  };

  const filterRows = () => {
    const filter = (input.value || '').toLowerCase().trim();

    // Wenn sich der Filter ändert: offene Mobile-Descriptions schließen
    removeDescriptionRows();

    const rows = tbody
      ? Array.from(tbody.querySelectorAll('tr'))
      : Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach((tr) => {
      // Ignorieren (und sicherheitshalber ausblenden), falls doch vorhanden
      if (tr.classList.contains('description-row')) {
        tr.style.display = 'none';
        return;
      }

      const text = (tr.textContent || '').toLowerCase();
      tr.style.display = text.includes(filter) ? '' : 'none';
    });
  };

  // Kein Inline-Handler mehr: Events sauber im JS
  input.addEventListener('input', filterRows);
  input.addEventListener('keyup', filterRows);

  // -------------------------
  // Mobile: Description Toggle
  // -------------------------
  const isLikelyMobile =
    window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches ||
    /Mobi|Android|iPhone/i.test(navigator.userAgent);

  if (isLikelyMobile && tbody) {
    tbody.querySelectorAll('tr').forEach((row) => {
      row.addEventListener('click', () => {
        // Wenn gefiltert/ausgeblendet, keine Interaktion
        if (row.style.display === 'none') return;

        // Falls direkt darunter schon eine Beschreibung steht -> schließen
        const next = row.nextElementSibling;
        if (next && next.classList.contains('description-row')) {
          next.remove();
          return;
        }

        // Sonst: andere offene Beschreibungen schließen (damit nicht 20 offen sind)
        removeDescriptionRows();

        const descCell = row.querySelector('td:nth-child(3)');
        const desc = (descCell?.textContent || '').trim();

        const descRow = document.createElement('tr');
        descRow.classList.add('description-row');

        const cell = document.createElement('td');
        cell.setAttribute('colspan', '2');
        cell.textContent = desc;

        descRow.appendChild(cell);

        row.parentNode.insertBefore(descRow, row.nextSibling);
      });
    });
  }
})();
