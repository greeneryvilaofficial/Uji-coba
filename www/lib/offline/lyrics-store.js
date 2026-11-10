/* ============================================================================================
 * [LABEL GWLY / STORE] src/lib/offline/lyrics-store.js  (v1.8.0)
 * Penyimpanan OFFLINE untuk lagu/lirik hasil Gemini: localStorage['gw_lyrics_v1'] di HP ini. TIDAK ada jaringan di berkas ini.
 *  - Maks 200 lagu dan ~1,2 MB total (yang terlama dibuang dulu); localStorage penuh/diblokir -> galat jelas, tidak melempar.
 *  - Data yang rusak/asing di penyimpanan diabaikan, bukan membuat panel error.
 *  GWTR.lyrics = { list(), get(id), add({prompt,text,model}), remove(id), clear(), count(), splitTitle(text) }
 * ============================================================================================ */
(function (root) {
  'use strict';
  var NS = root.GWTR = root.GWTR || {};
  if (NS.lyrics) return;
  var KEY = 'gw_lyrics_v1', MAX_ITEMS = 200, MAX_BYTES = 1200000;
  function fail(error) { return { ok: false, error: error }; }

  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
  function read() {
    var s = ls(), arr = []; if (!s) return arr;
    try { arr = JSON.parse(s.getItem(KEY) || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (x) { return x && typeof x.id === 'string' && typeof x.text === 'string' && typeof x.title === 'string'; })
      .map(function (x) { return { id: x.id, title: x.title.slice(0, 120), prompt: typeof x.prompt === 'string' ? x.prompt.slice(0, 300) : '', text: x.text, date: typeof x.date === 'string' ? x.date : '', model: typeof x.model === 'string' ? x.model.slice(0, 60) : '' }; });
  }
  function bytes(arr) { try { return JSON.stringify(arr).length; } catch (e) { return 0; } }
  function write(arr) { var s = ls(); if (!s) return false; try { s.setItem(KEY, JSON.stringify(arr)); return true; } catch (e) { return false; } }

  /* Judul dari baris "Judul: ..." (atau "Title:"); kalau tidak ada, baris pertama yang tidak kosong. */
  function splitTitle(text) {
    var lines = String(text == null ? '' : text).split('\n'), i, m;
    for (i = 0; i < lines.length && i < 6; i++) {
      m = /^\s*[*#_\s]*(judul|title)[*_\s]*[:\-–]\s*(.+?)\s*$/i.exec(lines[i]);
      if (m) { var t = m[2].replace(/[*_#"“”]/g, '').trim(); if (t) return t.slice(0, 80); }
    }
    for (i = 0; i < lines.length; i++) { var l = lines[i].replace(/[*_#"“”]/g, '').trim(); if (l) return l.slice(0, 60); }
    return '(tanpa judul)';
  }

  function list() { return read().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }); }   // terbaru dulu
  function get(id) { var a = read(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function count() { return read().length; }
  function add(o) {
    var text = o && typeof o.text === 'string' ? o.text.trim() : '';
    if (!text) return fail('empty');
    if (!ls()) return fail('storage-unavailable');
    var item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), title: splitTitle(text), prompt: String(o.prompt == null ? '' : o.prompt).slice(0, 300),
      text: text.slice(0, 8000), date: new Date().toISOString(), model: String(o.model || '').slice(0, 60) };
    var arr = read(); arr.push(item);
    arr.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });   // lama -> baru
    while (arr.length > MAX_ITEMS || (arr.length > 1 && bytes(arr) > MAX_BYTES)) arr.shift();
    var tries = 0;
    while (!write(arr)) { if (arr.length <= 1 || ++tries > 20) return fail('storage-full'); arr.shift(); }   // penyimpanan penuh: buang yang terlama lalu coba lagi
    return arr.some(function (x) { return x.id === item.id; }) ? { ok: true, item: item, total: arr.length } : fail('storage-full');
  }
  function remove(id) { var a = read(), b = a.filter(function (x) { return x.id !== id; }); if (b.length === a.length) return fail('not-found'); return write(b) ? { ok: true } : fail('storage-unavailable'); }
  function clear() { var s = ls(); try { if (s) s.removeItem(KEY); } catch (e) {} return { ok: true }; }

  NS.lyrics = { KEY: KEY, MAX_ITEMS: MAX_ITEMS, list: list, get: get, add: add, remove: remove, clear: clear, count: count, splitTitle: splitTitle };
})(typeof window !== 'undefined' ? window : globalThis);
