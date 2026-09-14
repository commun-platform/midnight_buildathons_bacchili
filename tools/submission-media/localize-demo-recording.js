// Text-only English localization for the isolated filming browser. The recorder
// injects this with an explicit dictionary; application state and actions stay intact.
(() => {
  const dictionary = globalThis.__bacchiriFilmingTranslations;
  if (!dictionary || location.hostname !== '127.0.0.1') return;
  const entries = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length);
  const translate = value => entries.reduce((text, [from, to]) => text.split(from).join(to), value);
  function localize(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (root.parentElement?.closest('script,style,textarea,input')) return;
      const updated = translate(root.nodeValue);
      if (updated !== root.nodeValue) root.nodeValue = updated;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.matches?.('script,style,textarea,input')) return;
    for (const node of root.childNodes) localize(node);
  }
  const start = () => {
    document.documentElement.lang = 'en';
    localize(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') localize(record.target);
        else for (const node of record.addedNodes) localize(node);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
