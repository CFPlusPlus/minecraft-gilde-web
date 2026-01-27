/*
  E-Mail-Obfuskation (CSP-freundlich)
  - Die komplette Adresse steht nicht im ausgelieferten HTML.
  - Der Link/Text wird erst im Browser zusammengesetzt.

  Markup-Beispiel:
    <a class="js-email" href="#" data-user="webmaster" data-domain="minecraft-gilde.de">
      <span class="js-email-text">webmaster [at] minecraft-gilde.de</span>
    </a>
*/

(function () {
  /**
   * Basic sanitization: only allow typical e-mail characters for user + domain.
   * This is primarily defensive; in this project the values are static.
   */
  function safePart(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Allow a conservative set for user part (local-part without quotes)
    // and for domain (letters, digits, dots, hyphens).
    // We validate them separately below.
    return trimmed;
  }

  const anchors = document.querySelectorAll('a.js-email[data-user][data-domain]');

  anchors.forEach((a) => {
    const user = safePart(a.getAttribute('data-user'));
    const domain = safePart(a.getAttribute('data-domain'));

    if (!user || !domain) return;

    // Conservative validation
    if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(user)) return;
    if (!/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(domain)) return;

    const addr = `${user}@${domain}`;

    // Set visible text
    const textNode = a.querySelector('.js-email-text');
    if (textNode) {
      textNode.textContent = addr;
    } else {
      a.textContent = addr;
    }

    // Set clickable mailto
    a.setAttribute('href', `mailto:${addr}`);

    // Accessibility label if not already set
    if (!a.getAttribute('aria-label')) {
      a.setAttribute('aria-label', addr);
    }
  });
})();
