/* ============================================================================================
 * [LABEL GWTR / CORE] src/lib/core.js  (v1.6.0)
 * Namespace GWTR: daftar bahasa, validasi input, prompt terjemahan, pembersih keluaran.
 * TIDAK ADA jaringan di berkas ini. Hanya src/lib/online/gemini.js (lirik lagu, opsional) yang boleh menyentuh jaringan.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var NS = root.GWTR = root.GWTR || {};
  if (NS.core) return;

  var LANGS = {
    id: { name: 'Indonesia', en: 'Indonesian' },
    en: { name: 'Inggris', en: 'English' },
    su: { name: 'Sunda', en: 'Sundanese' },
    jv: { name: 'Jawa', en: 'Javanese' }
  };
  var MAX_CHARS = 500;

  function fail(error, detail) { var r = { ok: false, error: error }; if (detail) r.detail = String(detail).slice(0, 200); return r; }
  function done(text, engine, extra) { var r = { ok: true, text: text, engine: engine }; if (extra) for (var k in extra) r[k] = extra[k]; return r; }
  function isLang(c) { return typeof c === 'string' && Object.prototype.hasOwnProperty.call(LANGS, c); }

  function checkInput(text, from, to) {
    if (!isLang(from) || !isLang(to)) return fail('bad-lang');
    if (from === to) return fail('same-lang');
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!t) return fail('empty');
    if (t.length > MAX_CHARS) return fail('too-long', 'maks ' + MAX_CHARS + ' karakter');
    return { ok: true, text: t };
  }

  /* Prompt untuk Llama (offline). Bahasa Inggris supaya model kecil patuh. */
  function systemPrompt(from, to) {
    return 'You are a translation engine. Translate the user\'s text from ' + LANGS[from].en + ' to ' + LANGS[to].en +
      '. Output ONLY the translation: no quotes, no notes, no explanations. Keep names, numbers and emoji unchanged.';
  }

  function cleanOutput(s) {
    var t = String(s == null ? '' : s).replace(/\r/g, '').trim();
    t = t.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
    t = t.replace(/^(translation|terjemahan|hasil)\s*:\s*/i, '').trim();
    if (t.length > 1 && /^["“«].*["”»]$/.test(t)) t = t.slice(1, -1).trim();
    return t.slice(0, MAX_CHARS * 4);
  }

  /* Pesan galat Gemini yang dipakai bersama panel Lirik AI dan Terjemah. */
  var GEM_MSG = {
    'online-disabled': 'Gemini online belum dinyalakan (buka "✍ Lirik" → bagian "Gemini online").', 'no-key': 'Belum ada kunci API Gemini (buka "✍ Lirik" → bagian "Gemini online").',
    'key-rejected': 'Kunci ditolak Google (400/401/403). Periksa kuncinya, atau pembatasannya di Google AI Studio.',
    'model-404': 'Nama model tidak ditemukan (404). Model lama seperti gemini-1.5-flash sudah dihentikan; ganti nama model di "✍ Lirik".',
    'bad-request': 'Permintaan ditolak (400). Mungkin nama model salah.', 'rate-limited': 'Kena batas laju / kuota gratis habis (429). Tunggu sebentar.',
    'server-error': 'Server Google sedang sibuk (5xx). Coba lagi nanti.', 'timeout': 'Waktu habis (30 dtk).', 'network': 'Tidak ada koneksi internet.',
    'busy': 'Masih memproses permintaan sebelumnya.', 'too-fast': 'Terlalu cepat; tunggu 1 detik.', 'blocked': 'Jawaban ditahan filter keamanan Google. Coba ubah permintaannya.',
    'empty-answer': 'Jawaban kosong. Coba lagi atau ganti model.', 'bad-chord': 'Akor tidak valid.', 'no-actions': 'Gemini tidak menemukan perintah tab yang cocok. Coba kalimat lain.'
  };

  /* Navbar bersama tiga panel: ✍ Lirik · 🎸 Cerdas · 🌐 Terjemah. Pindah panel lewat window.gwNav (disediakan index.html). Panel Fitur cerdas membuat versinya sendiri dengan susunan yang sama. */
  var NAV = [['lyrics', '✍ Lirik'], ['smart', '🎸 Cerdas'], ['translate', '🌐 Terjemah']];
  function navCss(sel) {
    return sel + ' .gw-nav{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 6px}' + sel + ' .gw-nav button{margin:0;padding:7px 13px;border-radius:999px;background:var(--pill-bg);font-size:.9rem}' +
      sel + ' .gw-nav button.on{background:var(--key-enter-bg);color:var(--kb-bg);font-weight:600}body.theme-light ' + sel + ' .gw-nav button.on{color:var(--key-bubble-text)}';
  }
  function navBar(doc, parent, current) {
    var bar = doc.createElement('div'); bar.className = 'gw-nav';
    NAV.forEach(function (x) {
      var b = doc.createElement('button'); b.textContent = x[1]; b.className = x[0] === current ? 'on' : ''; b.setAttribute('data-nav', x[0]);
      b.addEventListener('click', function () { if (x[0] !== current && typeof root.gwNav === 'function') root.gwNav(x[0]); });
      bar.appendChild(b);
    });
    parent.appendChild(bar); return bar;
  }

  NS.version = '1.9.0';
  NS.core = { GEM_MSG: GEM_MSG, NAV: NAV, navCss: navCss, navBar: navBar, LANGS: LANGS, MAX_CHARS: MAX_CHARS, fail: fail, done: done, isLang: isLang, checkInput: checkInput, systemPrompt: systemPrompt, cleanOutput: cleanOutput };
})(typeof window !== 'undefined' ? window : globalThis);
