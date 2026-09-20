import { state } from './state.js';

/* A content path names the tree it lives in. Framework material is prefixed
 * `keel/`, program content is not — which is what lets a program's documents
 * and the framework's own material coexist in the flattened site layout without an
 * allowlist that has to guess between them. */
export function isSafePath(p) {
  if (typeof p !== 'string') return false;
  if (p.indexOf('..') !== -1 || p.indexOf('//') !== -1 || p.indexOf('\\') !== -1) return false;
  if (p.charAt(0) === '/') return false;
  if (/[\x00-\x1f\x7f]/.test(p)) return false;
  if (!/^[a-zA-Z0-9_\-.\/]+\.(md|yml|json)$/.test(p)) return false;
  const parts = p.split('/');
  if (parts[0] === 'keel') return parts.length > 1;
  if (parts.length === 1) return /^(config|publish)\.yml$/.test(p);
  return (state.types || []).some(function(t) { return t.folder === parts[0]; })
    || parts[0] === 'model';
}

export function safeUrl(url) {
  if (typeof url !== 'string') return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

/* Resolve the base URL for a content path. The dashboard is served from
 * _site/dashboard/, and the `keel/` prefix says which sibling tree to read. */
export function resolveBase(p) {
  return p.indexOf('keel/') === 0 ? '../' : '../program/';
}

export function resolvePath(h) { const c = h.replace(/#.*$/, '').replace(/\?.*$/, ''); if (c.indexOf('..') !== -1) return ''; const p = c.split('/'), r = []; for (let i = 0; i < p.length; i++) { if (p[i] === '.' || p[i] === '') continue; r.push(p[i]); } return r.join('/'); }

/* Resolve a relative markdown link (which may contain ../ and ./) against the
 * directory of basePath, returning a normalized repo-relative path with no '..'
 * left in it (so isSafePath still guards traversal). Returns '' if the link
 * escapes the repo root or basePath is absent. */
export function resolveRelative(basePath, h) {
  if (!basePath) return resolvePath(h);
  const c = String(h).replace(/#.*$/, '').replace(/\?.*$/, '');
  if (!c || c.charAt(0) === '/') return '';
  const stack = basePath.split('/'); stack.pop(); // drop the filename
  const parts = c.split('/');
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { if (!stack.length) return ''; stack.pop(); }
    else stack.push(seg);
  }
  return stack.join('/');
}

export function hookLinks(c, goFn, basePath) {
  const links = c.querySelectorAll('a');
  for (let i = 0; i < links.length; i++) {
    (function(a) {
      const h = a.getAttribute('href') || '';
      if (!h) return;
      if (/^https?:\/\//.test(h) || /^mailto:/.test(h)) return;
      if (/^[a-z]+:/i.test(h)) { a.addEventListener('click', function(e) { e.preventDefault(); }); a.removeAttribute('href'); return; }
      a.addEventListener('click', function(e) { const r = basePath ? resolveRelative(basePath, h) : resolvePath(h); if (isSafePath(r)) { goFn('doc/' + r, e); } else { if (typeof console !== 'undefined') console.warn('Unresolvable doc link:', h, basePath ? '(from ' + basePath + ')' : ''); e.preventDefault(); } });
    })(links[i]);
  }
}

export function safeFetch(p) {
  if (!isSafePath(p)) { console.warn('Blocked path:', p); return Promise.reject(new Error('Path blocked by security policy: ' + p)); }
  return fetch(resolveBase(p) + p, { cache: 'no-store' }).then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
}
