// Uji modul terjemah src/lib (tanpa dependency): node tools/translate-test.js
// fetch dan jembatan Llama dipalsukan; tidak ada jaringan sungguhan.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), LIB = path.join(ROOT, 'src', 'lib');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fail = 0, total = 0; const ok = (c, m) => { total++; if (!c) { fail++; console.log('GAGAL:', m); } else console.log('ok   :', m); };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---------- 1. pemindaian statis: hanya online/gemini.js (lirik lagu, opsional) yang boleh menyentuh jaringan ----------
  const files = walk(LIB), rel = f => path.relative(LIB, f).replace(/\\/g, '/');
  const NET = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'https://', 'http://', 'Authorization'];
  const offenders = files.filter(f => rel(f) !== 'online/gemini.js').flatMap(f => NET.filter(w => fs.readFileSync(f, 'utf8').includes(w)).map(w => rel(f) + ':' + w));
  ok(files.length === 9 && offenders.length === 0, 'semua berkas src/lib selain online/gemini.js bebas fetch/XHR/WebSocket/URL/Authorization' + (offenders.length ? ' -> ' + offenders : ''));
  const gemSrc = fs.readFileSync(path.join(LIB, 'online', 'gemini.js'), 'utf8');
  ok((gemSrc.match(/https:\/\//g) || []).length >= 1 && !/http:\/\//.test(gemSrc) && !fs.existsSync(path.join(LIB, 'online', 'spark.js')), 'gemini.js hanya memuat alamat https; spark.js (Muse Spark online) sudah dihapus');
  ok(!/localStorage\.(get|set)Item\('meta_key'/.test(files.map(f => fs.readFileSync(f, 'utf8')).join('')), 'tidak memakai kunci lama meta_key');

  // ---------- lingkungan palsu ----------
  global.window = global; const ls = {};
  global.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
  let fetchCalls = [], fetchImpl = null; global.fetch = (u, i) => { fetchCalls.push({ u, i }); return fetchImpl(u, i); };
  const mkResp = (status, obj) => Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
  for (const f of ['core', 'offline/dict-data', 'offline/dict-engine', 'offline/llama', 'router', 'ui/translate-panel']) { try { (0, eval)(fs.readFileSync(path.join(LIB, f + '.js'), 'utf8')); } catch (e) { if (f !== 'ui/translate-panel') throw e; } }
  const T = global.GWTR, C = T.core;
  ok(!!(T.core && T.dict && T.llama && T.translate) && !T.spark, 'semua modul termuat (core, dict, llama, router); tidak ada T.spark');

  // ---------- 2. kamus offline ----------
  const d = (s, a, b) => T.dict.translate(s, a, b);
  ok(d('Terima kasih, saya makan nasi di sini.', 'id', 'su').text === 'Hatur nuhun, abdi dahar sangu di dieu.', 'kamus id→su: frasa, tanda baca, huruf kapital');
  ok(d('Selamat pagi, kamu mau minum air?', 'id', 'jv').text === 'Sugeng enjing, kowe péngin ngombe banyu?', 'kamus id→jv');
  ok(d('thank you, good morning', 'en', 'id').text === 'terima kasih, selamat pagi', 'kamus en→id (frasa 2 kata)');
  ok(d('hade', 'su', 'id').text === 'baik', 'aksen diabaikan saat mencari (hade = hadé)');
  const unk = d('xyz qrs', 'id', 'en'); ok(unk.ok && unk.coverage === 0 && unk.unknown.length === 2 && unk.text === 'xyz qrs', 'kata asing dibiarkan dan dilaporkan (coverage 0)');
  ok(d('', 'id', 'en').error === 'empty' && d('a', 'id', 'id').error === 'same-lang' && d('a', 'id', 'xx').error === 'bad-lang' && d('x'.repeat(501), 'id', 'en').error === 'too-long', 'validasi input: kosong / bahasa sama / bahasa asing / terlalu panjang');
  const rows = T.dictRows; ok(rows.every(r => r.length === 4 && r.every(x => x && x.trim())), 'kamus benih: ' + rows.length + ' baris, semua 4 kolom terisi');

  // ---------- 3. Llama offline (jembatan palsu) ----------
  const L = T.llama;
  ok(L.status().available === false && L.status().reason === 'no-bridge', 'tanpa jembatan: status no-bridge, available=false');
  const p = L.buildPrompt('Halo', 'id', 'en');
  ok(p.startsWith('<|start_header_id|>system<|end_header_id|>') && p.includes('Indonesian to English') && p.endsWith('<|start_header_id|>assistant<|end_header_id|>\n\n') && p.includes('<|eot_id|>') && !p.includes('<|begin_of_text|>') && L.buildPrompt('a', 'id', 'en', { includeBos: true }).startsWith('<|begin_of_text|>'), 'templat chat Llama 3 benar (BOS opsional)');
  let r = await L.translate('Halo', 'id', 'en'); ok(!r.ok && r.error === 'llama-unavailable', 'tanpa jembatan: translate() gagal jujur, TIDAK berpura-pura');
  const mkBridge = st => { const b = { calls: [], status: () => JSON.stringify(st), generateAsync(id, prompt, n) { b.calls.push({ id, prompt, n }); return ''; } }; return b; };
  global.AndroidLlama = mkBridge({ nativeLib: false, modelPresent: true, modelPath: '/x', modelBytes: 1 }); ok(L.status().reason === 'no-native-lib', 'pustaka native tidak ada -> no-native-lib');
  global.AndroidLlama = mkBridge({ nativeLib: true, modelPresent: false, modelPath: '/sdcard/models' }); ok(L.status().reason === 'no-model' && L.status().text.includes('/sdcard/models'), 'model tidak ada -> no-model + lokasi folder');
  const br = global.AndroidLlama = mkBridge({ nativeLib: true, modelPresent: true, modelPath: '/m.gguf', modelBytes: 800 * 1048576 }); ok(L.status().available, 'pustaka + model ada -> available');
  let pr = L.translate('Selamat pagi', 'id', 'en'); await sleep(5);
  ok(br.calls.length === 1 && br.calls[0].prompt.includes('Selamat pagi') && br.calls[0].n >= 16 && br.calls[0].n <= 256, 'generateAsync dipanggil dengan prompt + batas token');
  const busy = await L.translate('lagi', 'id', 'en'); ok(busy.error === 'busy', 'permintaan kedua saat sibuk -> busy (tanpa antre)');
  global.__gwLlamaResult(br.calls[0].id, JSON.stringify({ ok: true, text: 'Translation: "Good morning"' })); r = await pr;
  ok(r.ok && r.text === 'Good morning' && r.engine === 'llama', 'hasil Llama dibersihkan (label & tanda kutip) dan engine=llama');
  pr = L.translate('Halo', 'id', 'en'); await sleep(5); global.__gwLlamaResult(br.calls[1].id, JSON.stringify({ ok: false, error: 'native-lib-missing' })); r = await pr;
  ok(!r.ok && r.error === 'llama-failed', 'galat native diteruskan sebagai llama-failed');
  pr = L.translate('Halo', 'id', 'en', { timeoutMs: 30 }); r = await pr; ok(r.error === 'timeout', 'timeout ditangani, tidak menggantung');
  global.__gwLlamaResult(999, '{"ok":true,"text":"x"}'); ok(true, 'hasil untuk id tak dikenal diabaikan tanpa galat');

  // ---------- 5. router ----------
  const n0 = fetchCalls.length;
  global.AndroidLlama = undefined; r = await T.translate('Terima kasih', 'id', 'su', { engine: 'auto' });
  ok(r.ok && r.engine === 'dict' && r.fellBack === true && r.text === 'Hatur nuhun', 'auto tanpa Llama -> kamus, ditandai fellBack');
  global.AndroidLlama = mkBridge({ nativeLib: true, modelPresent: true, modelPath: '/m', modelBytes: 1 }); const rb = global.AndroidLlama;
  let ap = T.translate('Terima kasih', 'id', 'en'); await sleep(5); global.__gwLlamaResult(rb.calls[0].id, JSON.stringify({ ok: true, text: 'Thank you' })); r = await ap; ok(r.engine === 'llama' && r.text === 'Thank you' && !r.fellBack, 'auto dengan Llama siap -> engine=llama');
  ap = T.translate('Terima kasih', 'id', 'en'); await sleep(5); global.__gwLlamaResult(rb.calls[1].id, JSON.stringify({ ok: false, error: 'x' })); r = await ap; ok(r.engine === 'dict' && r.fellBack && r.llamaError === 'llama-failed', 'auto: Llama gagal -> kamus, galat Llama dilaporkan');
  ok(fetchCalls.length === n0, 'terjemah TIDAK PERNAH memakai jaringan (semua mesin offline)');
  r = await T.translate('Halo', 'id', 'en', { engine: 'dict' }); ok(r.engine === 'dict' && (await T.translate('a', 'id', 'en', { engine: 'zzz' })).error === 'bad-engine', 'engine eksplisit dict / engine tidak dikenal');

  // ---------- 6. integrasi index.html, sw.js, build ----------
  const HTML = rd('www/index.html'), SW = rd('www/sw.js'), trm = /var TR_MODS = \[([^\]]+)\]/.exec(HTML);
  const mods = trm ? trm[1].match(/lib\/[a-z\/-]+\.js/g) : [];
  ok(mods.length === 6 && mods.every(m => fs.existsSync(path.join(LIB, m.slice(4))) && fs.existsSync(path.join(ROOT, 'www', m)) && SW.includes("'" + m + "'")), 'index.html memuat 6 modul lib terjemah: ada di src/lib, di www/lib, dan di cache sw.js');
  ok(mods.every(m => fs.readFileSync(path.join(LIB, m.slice(4)), 'utf8') === rd('www/' + m)), 'www/lib identik dengan src/lib');
  const blk = HTML.slice(HTML.indexOf('[LABEL AI / v1.5.0 / OFFLINE]'));
  ok(/gwTranslateOpen/.test(blk) && !/fetch\(|api\.meta|Authorization/.test(blk), 'blok AI hanya punya tombol + pemuat; tidak ada kode jaringan di index.html');
  ok((HTML.match(/loadTranslate\(/g) || []).length === 2 && /btn\('Buka Terjemah', function\(\)\{ loadTranslate\(\)/.test(HTML), 'loadTranslate() hanya didefinisikan + dipanggil dari tombol "Buka Terjemah" (modul online tidak dimuat saat start)');
  { const v = JSON.parse(rd('package.json')).version.split('.').map(Number); ok(v[0] > 1 || (v[0] === 1 && v[1] >= 6), 'package.json versi >= 1.6.0'); }
  ok(fs.existsSync(path.join(ROOT, 'native-patches', 'LlamaBridge.java')) && rd('native-patches/HtmlKeyboardService.java').includes('"AndroidLlama"') && /LlamaBridge\.java/.test(rd('.github/workflows/android-build.yml')) && /build:web|sync-lib/.test(rd('.github/workflows/android-build.yml')), 'build: LlamaBridge disalin, didaftarkan sebagai AndroidLlama, lib disinkronkan di workflow');
  ok(rd('.github/workflows/android-build.yml') === rd('workflows/android-build.yml'), '.github/workflows dan workflows/ identik');

  // ---------- 7. panel (DOM tiruan) ----------
  const byId = {}; class El { constructor(t) { this.tag = t; this.children = []; this.style = {}; this._text = ''; this.handlers = {}; this.value = ''; this.className = ''; this.disabled = false; }
    set id(v) { this._id = v; byId[v] = this; } get id() { return this._id; } set textContent(v) { this._text = String(v); } get textContent() { return this._text; }
    appendChild(c) { this.children.push(c); return c; } addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); } click() { (this.handlers.click || []).forEach(f => f({})); } }
  global.document = { head: new El('head'), body: new El('body'), createElement: t => new El(t), getElementById: id => byId[id] || null };
  delete global.gwTranslateOpen; (0, eval)(fs.readFileSync(path.join(LIB, 'ui', 'translate-panel.js'), 'utf8'));
  ok(typeof global.gwTranslateOpen === 'function', 'panel terdaftar (gwTranslateOpen)');
  global.AndroidLlama = undefined; global.gwTranslateOpen();
  ok(byId.gwTrPanel.style.display === 'block' && /Llama offline: belum siap/.test(byId['gwtr-status'].textContent) && !/Spark|online/i.test(byId['gwtr-status'].textContent), 'panel menampilkan status jujur: Llama belum siap, kamus siap, tidak ada mesin online');
  byId['gwtr-in'].value = 'Terima kasih'; byId['gwtr-from'].value = 'id'; byId['gwtr-to'].value = 'jv'; byId['gwtr-go'].click(); await sleep(20);
  ok(byId['gwtr-out'].textContent === 'Matur nuwun' && /Kamus offline/.test(byId['gwtr-note'].textContent) && /Llama belum siap/.test(byId['gwtr-note'].textContent), 'klik Terjemahkan: hasil kamus + keterangan mesin + alasan fallback');
  const bn = n => { const q = [byId.gwTrPanel]; while (q.length) { const e = q.shift(); if (e.tag === 'button' && e._text === n) return e; q.push(...e.children); } };
  ok(!bn('Spark online') && !!bn('Llama offline') && !!bn('Kamus offline') && fetchCalls.length === n0, 'pilihan mesin hanya Otomatis/Llama/Kamus (tidak ada Spark online); 0 jaringan');
  const walkEls = e => [e].concat(...e.children.map(walkEls)); ok(walkEls(byId.gwTrPanel).filter(e => e.tag === 'input' && e.type === 'password').length === 0, 'panel terjemah tidak punya kolom kunci (tidak ada mesin online)');

  console.log(fail ? '\n' + fail + ' dari ' + total + ' GAGAL' : '\nSEMUA LULUS (' + total + ' pemeriksaan terjemah)'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR UJI:', e); process.exit(1); });
