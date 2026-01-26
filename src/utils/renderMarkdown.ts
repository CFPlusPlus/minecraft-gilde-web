import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

marked.setOptions({
  gfm: true,
  breaks: true, // damit \n auch als <br> funktioniert, \n\n wird <p>
});

/**
 * Renders a small, safe subset of Markdown to sanitized HTML.
 * - Supports links like [Text](/pfad) and inline code via `...`
 * - Adds target=_blank for external http(s) links
 */
export function renderMarkdown(input: string): string {
  const source = String(input ?? '');

  // Make bare URLs clickable (but don't touch markdown link targets "(https://...)" or existing "<https://...>")
  const withAutoLinks = source.replace(/(?<![<(])https?:\/\/[^\s>]+/g, (url) => `<${url}>`);

  const rawHtml = marked.parse(withAutoLinks) as string;
  const clean = DOMPurify.sanitize(rawHtml);

  // Add target/rel for external links
  return clean.replace(
    /<a\s+href="(https?:\/\/[^"]+)"(?![^>]*\btarget=)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer"',
  );
}
