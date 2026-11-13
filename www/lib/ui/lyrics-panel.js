/* ============================================================================================
 * [LABEL GWLY / PANEL] src/lib/ui/lyrics-panel.js  (v1.8.0)
 * Panel "Lirik AI": tulis permintaan -> "Bikin Lagu" -> lirik + chord dari Google Gemini (online, opsional) ->
 * otomatis tersimpan OFFLINE di HP ini dan bisa dibuka lagi tanpa internet.
 * Warna 100% dari variabel CSS keyboard (ikut tema). SEMUA teks lagu/judul/permintaan lewat textContent (keluaran AI tidak dipercaya).
 * window.gwLyricsOpen() / window.gwLyricsClose()
 * ============================================================================================ */
(function (root) {
  'use strict';
  var NS = root.GWTR;
  if (!NS || !NS.core || !NS.gemini || !NS.lyrics || root.gwLyricsOpen) return;
  var C = NS.core, G = NS.gemini, S = NS.lyrics, doc = root.document, panel = null, shown = null, armed = {};

  var MSG = {   // pesan khusus panel ini; sisanya (galat Gemini) dari core.GEM_MSG
    'empty': 'Tulis dulu permintaan lagunya.', 'too-long': 'Terlalu panjang (maks ' + G.MAX_PROMPT + ' karakter).',
    'network': 'Tidak ada koneksi internet. (Lagu yang sudah tersimpan tetap bisa dibuka di bawah.)',
    'bad-key': 'Kunci tidak valid.', 'bad-model': 'Nama model tidak valid.',
    'storage-full': 'Penyimpanan HP penuh: lagu tidak tersimpan.', 'storage-unavailable': 'Penyimpanan lokal tidak tersedia.'
  };
  function msg(r) { var m = MSG[r.error] || C.GEM_MSG[r.error] || ('Gagal: ' + r.error); return r.detail ? m + ' (' + r.detail + ')' : m; }
  function $(id) { return doc.getElementById(id); }
  function setText(id, t) { var e = $(id); if (e) e.textContent = t; }

  function build() {
    var css = doc.createElement('style');
    css.textContent =
      '#gwLyPanel{position:absolute;inset:0;z-index:80;overflow:auto;padding:12px;box-sizing:border-box;background:var(--kb-bg);color:var(--key-text);font-family:Roboto,system-ui,sans-serif;font-size:.95rem}' +
      '#gwLyPanel .gw-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;margin-bottom:4px;border-bottom:1px solid var(--divider)}' +
      '#gwLyPanel .gw-title{font-size:1rem;font-weight:700}#gwLyPanel .gw-title b{color:var(--key-tag)}' +
      '#gwLyPanel button{margin:3px 4px 3px 0;padding:9px 12px;border:var(--key-border,none);border-radius:var(--key-radius,8px);background:var(--key-bg);color:var(--key-text);font:inherit;box-shadow:0 1px 0 var(--shadow)}' +
      '#gwLyPanel button:active{background:var(--key-active-bg)}#gwLyPanel button:disabled{opacity:.5}#gwLyPanel button.fn{background:var(--key-fn-bg);margin:3px 0}' +
      '#gwLyPanel h4{margin:14px 0 4px;font-size:.85rem;font-weight:700;color:var(--key-tag)}#gwLyPanel .hint{font-size:.75rem;color:var(--muted);margin:0 0 6px;white-space:pre-wrap;word-break:break-word}' +
      '#gwLyPanel textarea,#gwLyPanel input{display:block;width:100%;box-sizing:border-box;margin:4px 0;padding:10px;background:var(--key-fn-bg);color:var(--key-text);border:1px solid var(--divider);border-radius:var(--key-radius,8px);font:inherit}' +
      '#gwLyPanel textarea{min-height:56px;resize:vertical}' +
      '#gwLyPanel pre{margin:6px 0;padding:8px;background:var(--key-fn-bg);color:var(--key-text);border:1px solid var(--divider);border-radius:var(--key-radius,8px);white-space:pre-wrap;word-break:break-word;min-height:2.4em;max-height:260px;overflow:auto;font-family:inherit}' +
      '#gwLyPanel .row{display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--divider)}#gwLyPanel .row .song{flex:1;min-width:0;text-align:left;background:transparent;box-shadow:none;margin:0;padding:8px 6px}' +
      '#gwLyPanel .song .ttl{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#gwLyPanel .song .sub{display:block;font-size:.72rem;color:var(--muted)}' + C.navCss('#gwLyPanel');
    doc.head.appendChild(css);
    panel = doc.createElement('div'); panel.id = 'gwLyPanel'; panel.style.display = 'none';
    (doc.getElementById('kbWrap') || doc.body).appendChild(panel);

    function el(tag, text, cls, parent) { var e = doc.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; (parent || panel).appendChild(e); return e; }
    function btn(label, fn, id, parent) { var b = doc.createElement('button'); if (id) b.id = id; b.textContent = label; b.addEventListener('click', fn); (parent || panel).appendChild(b); return b; }
    function field(tag, id, ph, type, max) { var i = doc.createElement(tag); i.id = id; if (ph) i.placeholder = ph; if (type) i.type = type; if (max) i.maxLength = max; i.autocomplete = 'off'; i.spellcheck = false; panel.appendChild(i); return i; }

    var top = el('div', null, 'gw-top'), head = el('div', null, 'gw-head', top), t = doc.createElement('div'); t.className = 'gw-title'; t.textContent = '✍ Lirik AI · '; var b = doc.createElement('b'); b.textContent = 'Gemini'; t.appendChild(b); head.appendChild(t);
    btn('✕ Tutup', function () { root.gwLyricsClose(); }, null, head).className = 'fn';
    C.navBar(doc, top, 'lyrics');
    el('div', 'Memuat…', 'hint').id = 'gwly-status';

    field('textarea', 'gwly-prompt', 'cth: bikinin lagu galau chord gampang', null, G.MAX_PROMPT);
    btn('Bikin Lagu', run, 'gwly-go');
    btn('Ketik hasil', function () { if (shown && root.AndroidKeyboard && root.AndroidKeyboard.commitText) { try { root.AndroidKeyboard.commitText(shown); } catch (e) {} } }, 'gwly-type');
    var out = el('pre', 'Lagu tampil di sini. Hasil Gemini otomatis tersimpan OFFLINE di HP ini.'); out.id = 'gwly-out';
    el('div', '', 'hint').id = 'gwly-note';

    el('h4', 'Lagu tersimpan (offline — bisa dibuka tanpa internet)');
    el('div', null, 'saved').id = 'gwly-saved';

    el('h4', 'Gemini online (opsional, kunci milikmu sendiri)');
    el('div', 'Bawaan MATI. Jika dinyalakan, HANYA teks permintaan di kotak di atas (maks ' + G.MAX_PROMPT + ' karakter) dikirim ke Google Gemini API saat kamu menekan "Bikin Lagu". Ketikan keyboard, audio, tab, dan papan klip tidak pernah dikirim. Kunci disimpan di HP ini saja (buat di Google AI Studio). Pada tingkat gratis, Google dapat memakai isi permintaan untuk meningkatkan produknya.', 'hint');
    field('input', 'gwly-key', 'API key Gemini (dari Google AI Studio)', 'password', 100);
    field('input', 'gwly-model', 'Model (kosong = bawaan)', 'text', 60);
    btn('Simpan kunci/model', function () {
      var k = $('gwly-key').value; if (k) { var r = G.setKey(k); if (!r.ok) { setText('gwly-note', msg(r)); return; } $('gwly-key').value = ''; }
      var r2 = G.setConfig({ model: $('gwly-model').value.trim() }); setText('gwly-note', r2.ok ? 'Tersimpan.' : msg(r2)); refresh(); });
    btn('Hapus kunci', function () { G.clearKey(); setText('gwly-note', 'Kunci dihapus dari HP ini (cabut juga di Google AI Studio bila pernah bocor).'); refresh(); });
    btn('Nyalakan online', function () {
      if (G.isOn()) { G.enable(false); armed.on = false; refresh(); setText('gwly-note', 'Gemini online dimatikan.'); return; }
      if (!armed.on) { armed.on = true; $('gwly-toggle').textContent = 'Yakin? Permintaan akan dikirim ke Google'; setTimeout(function () { armed.on = false; refresh(); }, 4000); return; }
      armed.on = false; G.enable(true); refresh(); setText('gwly-note', 'Gemini online dinyalakan.'); }, 'gwly-toggle');
  }

  function refresh() {
    var cfg = G.getConfig();
    setText('gwly-status', 'Gemini online: ' + (G.isOn() ? 'NYALA' : 'mati') + ' · kunci ' + (G.hasKey() ? G.keyHint() : 'belum ada') + ' · model ' + cfg.model + '\nTersimpan offline: ' + S.count() + ' lagu');
    var m = $('gwly-model'); if (m) m.placeholder = 'Model (bawaan: ' + G.DEFAULTS.model + ')';
    var t = $('gwly-toggle'); if (t) t.textContent = G.isOn() ? 'Matikan online' : 'Nyalakan online';
    renderSaved();
  }

  function show(text) { shown = text; setText('gwly-out', text); }

  function renderSaved() {
    var box = $('gwly-saved'); if (!box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    var items = S.list();
    if (!items.length) { var h = doc.createElement('div'); h.className = 'hint'; h.textContent = 'Belum ada. Lagu yang kamu buat akan muncul di sini.'; box.appendChild(h); return; }
    items.forEach(function (it) {
      var row = doc.createElement('div'); row.className = 'row';
      var b = doc.createElement('button'); b.className = 'song';
      var a = doc.createElement('span'); a.className = 'ttl'; a.textContent = it.title; b.appendChild(a);
      var s = doc.createElement('span'); s.className = 'sub'; s.textContent = (it.date ? new Date(it.date).toLocaleString() : '') + (it.prompt ? ' · ' + it.prompt : ''); b.appendChild(s);
      b.addEventListener('click', function () { show(it.text); setText('gwly-note', 'Dibuka dari penyimpanan offline.'); });
      row.appendChild(b);
      var d = doc.createElement('button'); d.className = 'fn'; d.textContent = '🗑'; d.setAttribute && d.setAttribute('aria-label', 'Hapus ' + it.title);
      d.addEventListener('click', function () {
        var k = 'del:' + it.id;
        if (!armed[k]) { armed[k] = true; d.textContent = 'Hapus?'; setTimeout(function () { armed[k] = false; d.textContent = '🗑'; }, 3000); return; }
        armed[k] = false; S.remove(it.id); refresh();
      });
      row.appendChild(d); box.appendChild(row);
    });
  }

  function run() {
    var go = $('gwly-go'), prompt = $('gwly-prompt').value; go.disabled = true; setText('gwly-note', 'Lagi mikir… bentar ya…');
    G.lyrics(prompt).then(function (r) {
      go.disabled = false;
      if (!r.ok) { setText('gwly-note', '✗ ' + msg(r)); return; }
      show(r.text);
      var saved = S.add({ prompt: String(prompt).replace(/\s+/g, ' ').trim(), text: r.text, model: r.model });
      setText('gwly-note', (saved.ok ? '✓ Tersimpan offline (' + saved.total + ' lagu). Tanpa internet pun tetap ada di daftar bawah.' : '⚠ Lagu tampil tapi TIDAK tersimpan: ' + msg(saved)) + (r.truncated ? '\nCatatan: jawaban terpotong batas panjang.' : '') + '\nModel: ' + r.model + ' (ONLINE)');
      refresh();
    });
  }

  root.gwLyricsOpen = function () { if (!panel) build(); panel.style.display = 'block'; refresh(); };
  root.gwLyricsClose = function () { if (panel) panel.style.display = 'none'; };
})(typeof window !== 'undefined' ? window : globalThis);
