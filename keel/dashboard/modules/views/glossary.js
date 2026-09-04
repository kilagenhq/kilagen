import { mk, mkMetaRow, ghUrl } from '../dom.js';
import { state } from '../state.js';
import { setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { safeFetch } from '../security.js';
import { parseFM } from '../parsers.js';

export function renderGlossary() {
  setActiveView('glossary'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Reference' }, { label: 'Glossary' }]);
  mainEl.appendChild(mk('h1', '', 'Glossary'));
  mainEl.appendChild(mk('p', '', 'Controlled vocabulary for the security program. Sourced from glossary.md.'));
  const searchBox = mk('input', 'glossary-search'); searchBox.type = 'text'; searchBox.placeholder = 'Filter terms...'; mainEl.appendChild(searchBox);
  const filterBar = mk('div', 'glossary-filter'); const entriesContainer = mk('div', '');
  mainEl.appendChild(filterBar); mainEl.appendChild(entriesContainer);
  const cached = state.bodyCache['glossary.md'];
  (cached ? Promise.resolve(cached) : safeFetch('glossary.md').then(function(text) { return parseFM(text).body; })).then(function(body) {
    const sections = body.split(/^## /m).filter(function(s) { return s.trim(); });
    const allEntries = []; const sectionNames = [];
    sections.forEach(function(sec) {
      const lines = sec.split('\n'); const title = lines[0].trim(); sectionNames.push(title);
      const content = lines.slice(1).join('\n');
      const entries = content.split(/\n(?=\*\*)/).filter(function(e) { return e.trim() && e.trim().startsWith('**'); });
      entries.forEach(function(entry) {
        const m = entry.match(/^\*\*([^*]+)\*\*\s*(?:\(([^)]*)\))?\.\s*([\s\S]*)/);
        if (m) { allEntries.push({ term: m[1].trim(), prefix: m[2] ? m[2].trim() : '', def: m[3].trim().replace(/\n/g, ' '), section: title }); }
      });
    });
    filterBar.textContent = ''; let activeFilter = 'all';
    const allBtn = mk('button', 'active', 'All (' + allEntries.length + ')'); allBtn.addEventListener('click', function() { activeFilter = 'all'; updateFilter(); }); filterBar.appendChild(allBtn);
    sectionNames.forEach(function(s) { const short = s.replace(/Section [A-Z] \u2014 /, ''); const count = allEntries.filter(function(e) { return e.section === s; }).length; const btn = mk('button', '', short + ' (' + count + ')'); btn.addEventListener('click', function() { activeFilter = s; updateFilter(); }); filterBar.appendChild(btn); });
    function updateFilter() {
      const q = searchBox.value.toLowerCase().trim();
      filterBar.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
      if (activeFilter === 'all') filterBar.querySelector('button').classList.add('active');
      else { const btns = filterBar.querySelectorAll('button'); for (let i = 0; i < btns.length; i++) { if (btns[i].textContent.indexOf(activeFilter.replace(/Section [A-Z] \u2014 /, '')) !== -1) btns[i].classList.add('active'); } }
      entriesContainer.textContent = '';
      const filtered = allEntries.filter(function(e) {
        if (activeFilter !== 'all' && e.section !== activeFilter) return false;
        if (q && e.term.toLowerCase().indexOf(q) === -1 && e.def.toLowerCase().indexOf(q) === -1 && e.prefix.toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
      if (!filtered.length) { entriesContainer.appendChild(mk('p', '', 'No matching terms.')); return; }
      filtered.forEach(function(e) {
        const el = mk('div', 'glossary-entry'); const header = mk('div', ''); header.appendChild(mk('span', 'ge-term', e.term));
        if (e.prefix) header.appendChild(mk('span', 'ge-prefix', '(' + e.prefix + ')'));
        el.appendChild(header); el.appendChild(mk('div', 'ge-def', e.def)); entriesContainer.appendChild(el);
      });
    }
    searchBox.addEventListener('input', updateFilter); updateFilter();
    rightEl.textContent = '';
    rightEl.appendChild(mk('h3', '', 'Source'));
    const pathRow = mk('div', 'meta-row'); pathRow.appendChild(mk('span', 'meta-key', 'File')); const pathVal = mk('span', 'meta-val', 'keel/glossary.md'); pathVal.style.fontFamily = "'SF Mono',SFMono-Regular,Consolas,monospace"; pathVal.style.fontSize = '11px'; pathRow.appendChild(pathVal); rightEl.appendChild(pathRow);
    const ghHref = ghUrl('keel/glossary.md'); if (ghHref) { const ghLink = mk('a', 'source-link', 'View in GitHub'); ghLink.href = ghHref; ghLink.target = '_blank'; ghLink.rel = 'noopener noreferrer'; rightEl.appendChild(ghLink); }
  }).catch(function(err) { console.warn('Glossary load error:', err); entriesContainer.appendChild(mk('p', 'error-msg', 'Unable to load glossary: ' + (err.message || err))); });
}
