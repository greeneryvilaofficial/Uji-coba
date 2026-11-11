/* ============================================================================================
 * [LABEL GWTR / PANEL] src/lib/ui/translate-panel.js
 * Panel "Terjemah": pilih bahasa + mesin (Otomatis / Llama offline / Kamus offline / Gemini online). Kunci Gemini diatur di panel "✍ Lirik".
 * Warna 100% dari variabel CSS keyboard (ikut tema). Keluaran selalu lewat textContent.
 * window.gwTranslateOpen() / window.gwTranslateClose()
 * ============================================================================================ */
(function (root) {
  'use strict';
  var NS = root.GWTR;
  if (!NS || !NS.core || !NS.translate || root.gwTranslateOpen) return;
  var C = NS.core, doc = root.document, panel = null, engine = 'auto', last = null;

  var MSG = {
    'empty': 'Ketik teks dulu.', 'same-lang': 'Bahasa asal dan tujuan sama.', 'too-long': 'Terlalu panjang (maks ' + C.MAX_CHARS + ' karakter).',
    'llama-unavailable': 'Llama offline belum siap di HP ini.', 'busy': 'Masih memproses permintaan sebelumnya.', 'timeout': 'Waktu habis.'
  };
  function msg(r) { var m = MSG[r.error] || C.GEM_MSG[r.error] || ('Gagal: ' + r.error); return r.detail ? m + ' (' + r.detail + ')' : m; }
  function $(id) { return doc.getElementById(id); }
  function setText(id, t) { var e = $(id); if (e) e.textContent = t; }

  function build() {
    var css = doc.createElement('style');
    css.textContent =
      '#gwTrPanel{position:absolute;inset:0;z-index:80;overflow:auto;padding:12px;box-sizing:border-box;background:var(--kb-bg);color:var(--key-text);font-family:Roboto,system-ui,sans-serif;font-size:.95rem}' +
      '#gwTrPanel .gw-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;margin-bottom:4px;border-bottom:1px solid var(--divider)}' +
      '#gwTrPanel .gw-title{font-size:1rem;font-weight:700}#gwTrPanel .gw-title b{color:var(--key-tag)}' +
      '#gwTrPanel button{margin:3px 4px 3px 0;padding:9px 12px;border:var(--key-border,none);border-radius:var(--key-radius,8px);background:var(--key-bg);color:var(--key-text);font:inherit;box-shadow:0 1px 0 var(--shadow)}' +
      '#gwTrPanel button:active{background:var(--key-active-bg)}#gwTrPanel button:disabled{opacity:.5}#gwTrPanel button.fn{background:var(--key-fn-bg);margin:0}' +
      '#gwTrPanel .chips button{border-radius:999px;background:var(--pill-bg);padding:7px 13px;font-size:.9rem}' +
      '#gwTrPanel .chips button.on{background:var(--key-enter-bg);color:var(--kb-bg);font-weight:600}body.theme-light #gwTrPanel .chips button.on{color:var(--key-bubble-text)}' +
      '#gwTrPanel h4{margin:14px 0 4px;font-size:.85rem;font-weight:700;color:var(--key-tag)}#gwTrPanel .hint{font-size:.75rem;color:var(--muted);margin:0 0 6px;white-space:pre-wrap}' +
      '#gwTrPanel textarea,#gwTrPanel input,#gwTrPanel select{display:block;width:100%;box-sizing:border-box;margin:4px 0;padding:10px;background:var(--key-fn-bg);color:var(--key-text);border:1px solid var(--divider);border-radius:var(--key-radius,8px);font:inherit}' +
      '#gwTrPanel textarea{min-height:64px;resize:vertical}#gwTrPanel .row{display:flex;gap:6px;align-items:center}#gwTrPanel .row select{flex:1}' +
      '#gwTrPanel pre{margin:6px 0;padding:8px;background:var(--key-fn-bg);color:var(--key-text);border:1px solid var(--divider);border-radius:var(--key-radius,8px);white-space:pre-wrap;word-break:break-word;min-height:2.4em}' +
      '#gwTrPanel select option{background:var(--key-fn-bg);color:var(--key-text)}' + C.navCss('#gwTrPanel');
    doc.head.appendChild(css);
    panel = doc.createElement('div'); panel.id = 'gwTrPanel'; panel.style.display = 'none';
    (doc.getElementById('kbWrap') || doc.body).appendChild(panel);

    function el(tag, text, cls, parent) { var e = doc.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; (parent || panel).appendChild(e); return e; }
    function btn(label, fn, id, parent) { var b = doc.createElement('button'); if (id) b.id = id; b.textContent = label; b.addEventListener('click', fn); (parent || panel).appendChild(b); return b; }
    function field(tag, id, ph, type, max) { var i = doc.createElement(tag); i.id = id; if (ph) i.placeholder = ph; if (type) i.type = type; if (max) i.maxLength = max; i.autocomplete = 'off'; i.spellcheck = false; panel.appendChild(i); return i; }

    var head = el('div', null, 'gw-head'), t = doc.createElement('div'); t.className = 'gw-title'; t.textContent = '🌐 Terjemah · '; var b = doc.createElement('b'); b.textContent = 'EN ID SU JV'; t.appendChild(b); head.appendChild(t);
    btn('✕ Tutup', function () { root.gwTranslateClose(); }, null, head).className = 'fn';
    C.navBar(doc, panel, 'translate');
    el('div', 'Memuat…', 'hint').id = 'gwtr-status';

    var row = el('div', null, 'row'), from = doc.createElement('select'), to = doc.createElement('select'); from.id = 'gwtr-from'; to.id = 'gwtr-to';
    Object.keys(C.LANGS).forEach(function (c) { [from, to].forEach(function (s) { var o = doc.createElement('option'); o.value = c; o.textContent = C.LANGS[c].name; s.appendChild(o); }); });
    from.value = 'id'; to.value = 'en'; row.appendChild(from); btn('⇄', function () { var a = from.value; from.value = to.value; to.value = a; }, null, row); row.appendChild(to);

    var chips = el('div', null, 'chips'), cb = {};
    [['Otomatis', 'auto'], ['Llama offline', 'llama'], ['Kamus offline', 'dict'], ['Gemini online', 'gemini']].forEach(function (m) {
      cb[m[1]] = btn(m[0], function () { engine = m[1]; Object.keys(cb).forEach(function (k) { cb[k].className = ''; }); cb[m[1]].className = 'on'; refresh(); }, null, chips); });
    cb.auto.className = 'on';
    el('div', 'Otomatis = Llama offline bila siap, kalau tidak kamus offline; TIDAK pernah online. "Gemini online" hanya jalan bila kamu memilihnya, sudah menyalakan Gemini dan punya kunci (diatur di "✍ Lirik"); hanya teks di kotak ini yang dikirim.', 'hint');

    field('textarea', 'gwtr-in', 'Ketik teks (maks ' + C.MAX_CHARS + ' karakter)', null, C.MAX_CHARS);
    btn('Terjemahkan', run, 'gwtr-go');
    btn('Ketik hasil', function () { if (last && last.ok && root.AndroidKeyboard && root.AndroidKeyboard.commitText) { try { root.AndroidKeyboard.commitText(last.text); } catch (e) {} } }, 'gwtr-type');
    var out = el('pre', 'Hasil terjemahan tampil di sini.'); out.id = 'gwtr-out';
    el('div', '', 'hint').id = 'gwtr-note';
    btn('Atur kunci Gemini (✍ Lirik)', function () { if (typeof root.gwNav === 'function') root.gwNav('lyrics'); }, 'gwtr-setkey').className = 'fn';
  }

  function refresh() {
    var parts = [], st = NS.llama ? NS.llama.status() : { available: false, text: 'modul Llama tidak dimuat' };
    parts.push('Llama offline: ' + (st.available ? 'siap ✓' : 'belum siap — ' + st.text));
    parts.push('Kamus offline: siap ✓ (' + (NS.dict ? NS.dict.size() : 0) + ' entri benih)');
    parts.push('Gemini online: ' + (NS.gemini ? (NS.gemini.isOn() ? 'NYALA' : 'mati') + ' · kunci ' + (NS.gemini.hasKey() ? NS.gemini.keyHint() : 'belum ada') : 'modul tidak dimuat'));
    setText('gwtr-status', parts.join('\n'));
  }

  function run() {
    var text = $('gwtr-in').value, go = $('gwtr-go'); go.disabled = true; setText('gwtr-note', 'Memproses…');
    NS.translate(text, $('gwtr-from').value, $('gwtr-to').value, { engine: engine }).then(function (r) {
      last = r; go.disabled = false;
      if (!r.ok) { setText('gwtr-out', ''); setText('gwtr-note', '✗ ' + msg(r)); return; }
      setText('gwtr-out', r.text);
      var label = r.engine === 'llama' ? 'Meta Llama (offline, di perangkat)' : r.engine === 'gemini' ? 'Google Gemini (ONLINE)' : 'Kamus offline (kata-per-kata)';
      setText('gwtr-note', 'Mesin: ' + label + (r.fellBack ? ' — Llama belum siap, jadi memakai kamus' : '') + (r.note ? '\n' + r.note : ''));
    });
  }

  root.gwTranslateOpen = function () { if (!panel) build(); panel.style.display = 'block'; refresh(); };
  root.gwTranslateClose = function () { if (panel) panel.style.display = 'none'; };
})(typeof window !== 'undefined' ? window : globalThis);
