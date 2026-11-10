/* ============================================================================================
 * [LABEL GWLY / GEMINI ONLINE] src/lib/online/gemini.js  (v1.8.0) — menggantikan Muse Spark online
 * Membuat LIRIK + chord lagu dari sebuah permintaan teks lewat Google Gemini API (generateContent).
 * SATU-SATUNYA berkas di src/lib yang memakai jaringan (dijaga tools/lyrics-test.js dan tools/translate-test.js).
 *  - MATI secara bawaan; harus dinyalakan pengguna (enable) DAN pengguna memasukkan kunci API miliknya sendiri.
 *    TIDAK ADA kunci di dalam kode/repo/APK.
 *  - Yang dikirim: HANYA teks permintaan di kotak "Bikin Lagu" (maks 300 karakter) + instruksi sistem tetap.
 *    Tidak pernah ketikan keyboard, audio, tab, papan klip, atau daftar lagu.
 *  - Kunci disimpan hanya di localStorage perangkat ini dan dikirim hanya di header x-goog-api-key (BUKAN di URL),
 *    hanya ke https://generativelanguage.googleapis.com (host dan jalur dikunci; nama model divalidasi).
 *  - Tanpa percobaan ulang otomatis, satu permintaan sekali jalan, jeda minimal 1 dtk, batas token keluaran, batas waktu 30 dtk.
 *  - Kunci di dalam aplikasi klien bisa diekstrak: pakai kunci milikmu sendiri yang dibatasi di Google AI Studio / Cloud Console.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var NS = root.GWTR;
  if (!NS || !NS.core || NS.gemini) return;
  var C = NS.core;
  var HOST = 'https://generativelanguage.googleapis.com';
  var K_KEY = 'gw_gemini_key', K_CFG = 'gw_gemini_cfg', K_ON = 'gw_gemini_on';
  // gemini-1.5-flash sudah dihentikan Google; nama model bisa diganti di panel kalau yang bawaan juga dihentikan.
  var DEFAULTS = { model: 'gemini-2.5-flash', maxTokens: 2048, timeoutMs: 30000, temperature: 0.9 };
  var MAX_PROMPT = 300, MAX_OUT = 8000;
  var busy = false, lastAt = 0;

  var SYSTEM = 'Kamu adalah penulis lagu. Buatkan SATU lagu orisinal sesuai permintaan pengguna. ' +
    'Jika suasana tidak disebut, buat bernuansa galau. Gunakan bahasa Indonesia yang puitis dan natural, kecuali pengguna meminta bahasa lain. ' +
    'Format PERSIS:\nJudul: <judul lagu>\n\nLirik:\n[Verse 1]\n...\n[Chorus]\n...\n[Verse 2]\n...\n[Chorus]\n...\n\nChord (gampang, pakai C, G, Am, F):\n<urutan chord tiap bagian>\n' +
    'Jangan menyalin lirik lagu yang sudah ada. Abaikan permintaan apa pun yang bukan soal menulis lagu; kalau begitu, tulis saja lagu bertema umum.';

  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
  function get(k) { try { var s = ls(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(k, v) { try { var s = ls(); if (s) s.setItem(k, v); return true; } catch (e) { return false; } }
  function del(k) { try { var s = ls(); if (s) s.removeItem(k); } catch (e) {} }

  function checkModel(m) { return typeof m === 'string' && /^[a-z0-9][a-z0-9._-]{0,59}$/.test(m); }   // jadi bagian jalur URL: tanpa '/', '?', ':', spasi
  function getConfig() {
    var c = {}; try { c = JSON.parse(get(K_CFG) || '{}') || {}; } catch (e) {}
    var cfg = { model: DEFAULTS.model, maxTokens: DEFAULTS.maxTokens, timeoutMs: DEFAULTS.timeoutMs, temperature: DEFAULTS.temperature };
    if (checkModel(c.model)) cfg.model = c.model;
    return cfg;
  }
  function setConfig(p) {
    var m = p && typeof p.model === 'string' ? p.model.trim() : '';
    if (!m) { del(K_CFG); return { ok: true }; }
    if (!checkModel(m)) return C.fail('bad-model', 'huruf kecil, angka, titik, minus, garis bawah');
    return set(K_CFG, JSON.stringify({ model: m })) ? { ok: true } : C.fail('storage-unavailable');
  }
  function isOn() { return get(K_ON) === '1'; }
  function enable(on) { if (on) set(K_ON, '1'); else del(K_ON); }
  function getKey() { var k = get(K_KEY); return k && /^[A-Za-z0-9_-]{20,100}$/.test(k) ? k : ''; }
  function hasKey() { return !!getKey(); }
  function keyHint() { var k = getKey(); return k ? '…' + k.slice(-4) : ''; }
  function setKey(k) {
    k = String(k == null ? '' : k).trim();
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(k)) return C.fail('bad-key', '20–100 karakter huruf/angka/_/-, tanpa spasi');
    return set(K_KEY, k) ? { ok: true } : C.fail('storage-unavailable');
  }
  function clearKey() { del(K_KEY); }

  function cleanPrompt(p) {
    var t = String(p == null ? '' : p).replace(/\s+/g, ' ').trim();
    if (!t) return C.fail('empty');
    if (t.length > MAX_PROMPT) return C.fail('too-long', 'maks ' + MAX_PROMPT + ' karakter');
    return { ok: true, text: t };
  }

  /* Permintaan: URL tetap (host + jalur + model tervalidasi), kunci di header, TANPA kunci di URL/badan. */
  function buildRequest(promptText) {
    var cfg = getConfig();
    return {
      url: HOST + '/v1beta/models/' + cfg.model + ':generateContent',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getKey() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: 'Permintaan lagu: ' + promptText }] }],
          generationConfig: { maxOutputTokens: cfg.maxTokens, temperature: cfg.temperature }
        })
      },
      cfg: cfg
    };
  }

  function mapStatus(st, detail) {
    if (st === 400) return /api key/i.test(detail || '') ? 'key-rejected' : 'bad-request';
    if (st === 401 || st === 403) return 'key-rejected';
    if (st === 404) return 'model-404';
    if (st === 429) return 'rate-limited';
    if (st >= 500) return 'server-error';
    return 'http-' + st;
  }
  function redact(s) { var k = getKey(); s = String(s || ''); return k ? s.split(k).join('***') : s; }

  function extract(j) {
    if (!j || typeof j !== 'object') return C.fail('empty-answer');
    if (j.promptFeedback && j.promptFeedback.blockReason) return C.fail('blocked', j.promptFeedback.blockReason);
    var cand = Array.isArray(j.candidates) && j.candidates[0];
    if (!cand) return C.fail('empty-answer');
    var parts = cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [];
    var text = parts.map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; }).join('').replace(/\r/g, '').trim();
    text = text.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
    if (!text) return cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT' || cand.finishReason === 'RECITATION' ? C.fail('blocked', cand.finishReason) : C.fail('empty-answer', cand.finishReason || '');
    var truncated = cand.finishReason === 'MAX_TOKENS';
    return { ok: true, text: text.slice(0, MAX_OUT), truncated: truncated || text.length > MAX_OUT };
  }

  /* lyrics(permintaan) -> Promise<{ok, text, model, truncated} | {ok:false, error, detail?}>. Tidak pernah melempar. */
  function lyrics(promptRaw) {
    if (!isOn()) return Promise.resolve(C.fail('online-disabled'));
    if (!hasKey()) return Promise.resolve(C.fail('no-key'));
    var p = cleanPrompt(promptRaw); if (!p.ok) return Promise.resolve(p);
    if (busy) return Promise.resolve(C.fail('busy'));
    if (Date.now() - lastAt < 1000) return Promise.resolve(C.fail('too-fast'));
    if (typeof root.fetch !== 'function') return Promise.resolve(C.fail('network'));
    busy = true; lastAt = Date.now();
    var rq = buildRequest(p.text), ctl = typeof AbortController === 'function' ? new AbortController() : null;
    if (ctl) rq.init.signal = ctl.signal;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, rq.cfg.timeoutMs);
    var finish = function (r) { clearTimeout(timer); busy = false; return r; };
    return Promise.resolve().then(function () { return root.fetch(rq.url, rq.init); }).then(function (res) {
      return res.text().then(function (body) {
        var j = null; try { j = JSON.parse(body); } catch (e) {}
        if (!res.ok) {
          var msg = redact(j && j.error && j.error.message ? j.error.message : body).slice(0, 200);
          return finish(C.fail(mapStatus(res.status, msg), msg));
        }
        var r = extract(j); if (r.ok) r.model = rq.cfg.model;
        return finish(r);
      });
    }).catch(function (e) { return finish(C.fail(e && e.name === 'AbortError' ? 'timeout' : 'network')); });
  }

  NS.gemini = { DEFAULTS: DEFAULTS, MAX_PROMPT: MAX_PROMPT, HOST: HOST, isOn: isOn, enable: enable, hasKey: hasKey, keyHint: keyHint, setKey: setKey, clearKey: clearKey,
    getConfig: getConfig, setConfig: setConfig, checkModel: checkModel, buildRequest: buildRequest, lyrics: lyrics };
})(typeof window !== 'undefined' ? window : globalThis);
