/* ============================================================================================
 * [LABEL GWLY / GEMINI ONLINE] src/lib/online/gemini.js  (v1.9.0) — menggantikan Muse Spark online
 * Satu mesin Gemini (generateContent) untuk TIGA tugas teks: lyrics() lirik+chord lagu, translate() terjemah, command() memahami
 * perintah bebas untuk editor tab (keluarannya hanya diterima bila cocok dengan DAFTAR PERINTAH yang diizinkan; teks lain dibuang).
 * SATU-SATUNYA berkas di src/lib yang memakai jaringan (dijaga tools/lyrics-test.js dan tools/translate-test.js).
 *  - MATI secara bawaan; harus dinyalakan pengguna (enable) DAN pengguna memasukkan kunci API miliknya sendiri.
 *    TIDAK ADA kunci di dalam kode/repo/APK.
 *  - Yang dikirim: HANYA teks yang kamu tulis di kotak fitur itu (lagu <=300, terjemah <=500, perintah <=100 karakter; akor <=16) + instruksi sistem tetap.
 *    Tidak pernah ketikan keyboard biasa, audio/humming, isi tab, papan klip, atau daftar lagu.
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
  function systemFor(chords) {   // akor dari pengguna: pakai persis akor itu, bukan C G Am F
    return chords ? SYSTEM.replace('Chord (gampang, pakai C, G, Am, F):', 'Chord (pakai PERSIS akor yang diberikan pengguna, ulangi sesuai kebutuhan; tulis juga di atas baris lirik):') : SYSTEM;
  }
  var CHORD_RE = /^[A-G][#b]?[A-Za-z0-9#+\-]{0,8}(\/[A-G][#b]?)?$/;
  function cleanChords(c) {
    if (c == null || c === '') return { ok: true, text: '' };
    var t = String(c).split(/[\s,|]+/).filter(Boolean);
    if (!t.length || t.length > 16) return C.fail('bad-chord', 'maks 16 akor');
    for (var i = 0; i < t.length; i++) if (!CHORD_RE.test(t[i])) return C.fail('bad-chord', t[i].slice(0, 12));
    return { ok: true, text: t.join(' ') };
  }
  // Perintah editor tab yang BOLEH dihasilkan Gemini (daftar tertutup). Kata di kiri = yang diminta dari Gemini, kanan = kalimat untuk penafsir offline.
  var CMD_PHRASE = { bluesy: 'bikin lebih bluesy', galau: 'buat jadi galau', ceria: 'bikin ceria', rock: 'jadi rock', fingerstyle: 'versi fingerstyle', cepat: 'lebih cepat', lambat: 'lebih lambat', ulang: 'ulang dua kali' };
  var CMD_SYSTEM = 'Kamu penerjemah perintah untuk editor tab gitar. Pilih HANYA dari daftar ini: bluesy, galau, ceria, rock, fingerstyle, cepat, lambat, ulang, naik:N, turun:N (N = 1 sampai 12 semiton). ' +
    'Balas HANYA array JSON berisi string dari daftar itu (maksimal 4 item), tanpa teks lain. Jika permintaan tidak cocok dengan apa pun, balas [].';

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
  var KEY_RE = /^[A-Za-z0-9._-]{20,100}$/;   // titik diizinkan: kunci format baru berawalan "AQ." (kunci lama "AIza..." tetap lolos); kunci hanya ke header, tidak pernah ke URL
  function getKey() { var k = get(K_KEY); return k && KEY_RE.test(k) ? k : ''; }
  function hasKey() { return !!getKey(); }
  function keyHint() { var k = getKey(); return k ? '…' + k.slice(-4) : ''; }
  function setKey(k) {
    k = String(k == null ? '' : k).trim();
    if (!KEY_RE.test(k)) return C.fail('bad-key', '20–100 karakter huruf/angka/titik/_/-, tanpa spasi');
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
  function buildRaw(system, userText, o) {
    var cfg = getConfig(); o = o || {};
    var gc = { maxOutputTokens: o.maxTokens || cfg.maxTokens, temperature: o.temperature != null ? o.temperature : cfg.temperature };
    if (/^gemini-2\.5-flash/.test(cfg.model)) gc.thinkingConfig = { thinkingBudget: 0 };   // 2.5 Flash/Flash-Lite: matikan "berpikir" (hemat token & waktu); model lain tidak diberi kolom ini
    return {
      url: HOST + '/v1beta/models/' + cfg.model + ':generateContent',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getKey() },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: userText }] }], generationConfig: gc })
      },
      cfg: cfg
    };
  }
  function buildRequest(promptText, chords) { return buildRaw(systemFor(chords), 'Permintaan lagu: ' + promptText + (chords ? '\nAkor: ' + chords : ''), {}); }

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

  /* call(): satu jalur untuk semua tugas. Penjaga: online mati / tanpa kunci / sibuk / terlalu cepat. Tidak pernah melempar. */
  function call(rq) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
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
  function gate() {
    if (!isOn()) return C.fail('online-disabled');
    if (!hasKey()) return C.fail('no-key');
    return null;
  }
  function start() {   // setelah semua pemeriksaan masukan lolos: cek sibuk/cepat lalu tandai
    if (busy) return C.fail('busy');
    if (Date.now() - lastAt < 1000) return C.fail('too-fast');
    if (typeof root.fetch !== 'function') return C.fail('network');
    busy = true; lastAt = Date.now(); return null;
  }

  /* lyrics(permintaan, {chords}) -> Promise<{ok, text, model, truncated} | {ok:false, error, detail?}> */
  function lyrics(promptRaw, opts) {
    var g = gate(); if (g) return Promise.resolve(g);
    var p = cleanPrompt(promptRaw); if (!p.ok) return Promise.resolve(p);
    var ch = cleanChords(opts && opts.chords); if (!ch.ok) return Promise.resolve(ch);
    var st = start(); if (st) return Promise.resolve(st);
    return call(buildRequest(p.text, ch.text));
  }

  /* translate(teks, dari, ke) -> {ok, text, engine:'gemini'}. Prompt terjemah sama dengan Llama offline (core.systemPrompt). Maks 500 karakter. */
  function translate(text, from, to) {
    var g = gate(); if (g) return Promise.resolve(g);
    var c = C.checkInput(text, from, to); if (!c.ok) return Promise.resolve(c);
    var st = start(); if (st) return Promise.resolve(st);
    return call(buildRaw(C.systemPrompt(from, to), c.text, { maxTokens: 1024, temperature: 0.2 })).then(function (r) {
      if (!r.ok) return r;
      var t = C.cleanOutput(r.text); return t ? C.done(t, 'gemini', { model: r.model }) : C.fail('empty-answer');
    });
  }

  /* command(teks) -> {ok, actions:[...], text} — Gemini hanya MEMILIH dari daftar tertutup; apa pun di luar daftar dibuang.
     `text` adalah kalimat untuk penafsir OFFLINE (GWAI.editor.run); Gemini tidak pernah mengubah tab sendiri. Maks 100 karakter. */
  function command(textRaw) {
    var g = gate(); if (g) return Promise.resolve(g);
    var t = String(textRaw == null ? '' : textRaw).replace(/\s+/g, ' ').trim();
    if (!t) return Promise.resolve(C.fail('empty'));
    if (t.length > 100) return Promise.resolve(C.fail('too-long', 'maks 100 karakter'));
    var st = start(); if (st) return Promise.resolve(st);
    return call(buildRaw(CMD_SYSTEM, t, { maxTokens: 512, temperature: 0 })).then(function (r) {
      if (!r.ok) return r;
      var arr = null; try { arr = JSON.parse(r.text.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim()); } catch (e) {}
      if (!Array.isArray(arr)) return C.fail('empty-answer', 'bukan daftar perintah');
      var seen = {}, acts = [], phrases = [], shift = false;
      arr.forEach(function (x) {
        if (typeof x !== 'string' || acts.length >= 4) return;
        var m = /^(naik|turun):([1-9]|1[0-2])$/.exec(x);
        if (m) { if (shift || seen[x]) return; shift = true; seen[x] = 1; acts.push(x); phrases.push((m[1] === 'naik' ? 'naikin ' : 'turunin ') + m[2] + ' nada'); return; }
        if (Object.prototype.hasOwnProperty.call(CMD_PHRASE, x) && !seen[x]) { seen[x] = 1; acts.push(x); phrases.push(CMD_PHRASE[x]); }
      });
      return acts.length ? { ok: true, actions: acts, text: phrases.join(' dan '), engine: 'gemini', model: r.model } : C.fail('no-actions');
    });
  }

  NS.gemini = { DEFAULTS: DEFAULTS, MAX_PROMPT: MAX_PROMPT, HOST: HOST, isOn: isOn, enable: enable, hasKey: hasKey, keyHint: keyHint, setKey: setKey, clearKey: clearKey,
    getConfig: getConfig, setConfig: setConfig, checkModel: checkModel, buildRequest: buildRequest, lyrics: lyrics, translate: translate, command: command };
})(typeof window !== 'undefined' ? window : globalThis);
