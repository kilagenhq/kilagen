const marked = window.marked;
const DOMPurify = window.DOMPurify;
const jsyaml = window.jsyaml;

marked.use({ breaks: false, gfm: true });

const TAGS = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'del'];
export const purCfg = { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ['href', 'title', 'src', 'alt'], ALLOW_DATA_ATTR: false };

DOMPurify.addHook('afterSanitizeAttributes', function(n) {
  if (n.tagName === 'A') { const h = n.getAttribute('href') || ''; if (/^https?:\/\//.test(h) || /^mailto:/.test(h)) { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); } }
  // Block all external/dangerous image sources — documents are local markdown;
  // allowing remote images would enable tracking pixels and unreviewed content.
  if (n.tagName === 'IMG') { const s = n.getAttribute('src') || ''; if (/^javascript:/i.test(s) || /^https?:\/\//i.test(s) || /^data:/i.test(s)) { n.removeAttribute('src'); n.setAttribute('alt', '[blocked]'); } }
});

export function renderMd(md) { return DOMPurify.sanitize(marked.parse(md), purCfg); }

export function parseFM(text) {
  if (text.substring(0, 3) !== '---') return { fm: null, body: text };
  const e = text.indexOf('---', 3);
  if (e === -1) return { fm: null, body: text };
  // FAILSAFE_SCHEMA: all values stay as strings — prevents type coercion of dates, booleans, etc.
  try { return { fm: jsyaml.load(text.substring(3, e), { schema: jsyaml.FAILSAFE_SCHEMA }), body: text.substring(e + 3) }; } catch (x) { console.warn('YAML frontmatter parse error:', x.message); return { fm: null, body: text.substring(e + 3), parseError: x.message }; }
}

export function parseYml(t) { try { return jsyaml.load(t, { schema: jsyaml.FAILSAFE_SCHEMA }); } catch (x) { console.warn('YAML parse error:', x.message); return { ok: false, error: x.message }; } }

export function safeHtmlNode(sanitizedHtml) { const wrapper = document.createElement('div'); wrapper.innerHTML = sanitizedHtml; return wrapper; }
