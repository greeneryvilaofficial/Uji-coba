// Uji LIRIK AI (v1.8.0): src/lib/online/gemini.js + offline/lyrics-store.js + ui/lyrics-panel.js.
// fetch dan localStorage DIPALSUKAN; tidak ada permintaan ke Google sungguhan.
// Dibuktikan: bentuk permintaan, kunci tidak bocor, penjaga (mati/tanpa kunci/sibuk/cepat), pemetaan galat, penyimpanan offline,
// panel (teks AI hanya lewat textContent, daftar tersimpan terbuka tanpa jaringan). TIDAK dibuktikan: bahwa server Google menerimanya.
// Jalankan: node tools/lyrics-test.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), LIB = path.join(ROOT, 'src', 'lib'), rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fail = 0, total = 0; const ok = (c, m) => { total++; if (!c) { fail++; console.log('GAGAL:', m); } else console.log('ok   :', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GEM = fs.readFileSync(path.join(LIB, 'online/gemini.js'), 'utf8'), STORE = fs.readFileSync(path.join(LIB, 'offline/lyrics-store.js'), 'utf8'), PANEL = fs.readFileSync(path.join(LIB, 'ui/lyrics-panel.js'), 'utf8');

(async () => {
  // ---------- statis
  const NET = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'https://', 'http://', 'x-goog-api-key'];
  ok([STORE, PANEL].every(src => NET.every(t => !src.includes(t))), 'lyrics-store.js dan lyrics-panel.js bebas kode jaringan (semua jaringan hanya di gemini.js)');
  ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|\balert\(/.test(PANEL + STORE), 'panel/penyimpanan: tanpa innerHTML/eval/alert (keluaran AI hanya lewat textContent)');
  ok(!/AIza[0-9A-Za-z_-]{20,}/.test(GEM + PANEL + STORE + rd('www/index.html') + rd('README.md')) && !/ISI_API_KEY/.test(GEM + PANEL), 'tidak ada kunci API tertanam di kode/README/index.html');
  ok(/https:\/\/generativelanguage\.googleapis\.com/.test(GEM) && !/http:\/\//.test(GEM) && !/[?&]key=/.test(GEM) && /x-goog-api-key/.test(GEM) && !/Authorization|Bearer/.test(GEM), 'gemini.js: satu host https, kunci lewat header (bukan ?key= di URL)');
  ok(!fs.existsSync(path.join(LIB, 'online/spark.js')) && !fs.existsSync(path.join(ROOT, 'www/lib/online/spark.js')), 'Muse Spark online (spark.js) sudah dihapus dari src/lib dan www/lib');
  ok(!/gemini-1\.5/.test(GEM.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/gemini-1\.5-flash sudah dihentikan[^\n]*/, '')), 'model bawaan bukan gemini-1.5-flash (sudah dihentikan Google)');

  // ---------- lingkungan palsu
  global.window = global; const ls = {}; let quotaLeft = Infinity;
  global.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { if (String(v).length > quotaLeft) { const e = new Error('Quota'); e.name = 'QuotaExceededError'; throw e; } ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
  const calls = []; let impl = null; global.fetch = (u, i) => { calls.push({ u, i, body: JSON.parse(i.body) }); return impl(u, i); };
  const resp = (st, obj) => Promise.resolve({ ok: st >= 200 && st < 300, status: st, text: () => Promise.resolve(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
  const okBody = txt => ({ candidates: [{ content: { parts: [{ text: txt }] }, finishReason: 'STOP' }] });
  for (const f of ['core', 'online/gemini', 'offline/lyrics-store']) (0, eval)(fs.readFileSync(path.join(LIB, f + '.js'), 'utf8'));
  const T = global.GWTR, G = T.gemini, S = T.lyrics, KEY = 'TESTKEY_abcdefghijklmnop1234';
  ok(!!(T.core && G && S), 'modul termuat: core, gemini, lyrics-store');

  // ---------- 1. penjaga & konfigurasi
  ok(G.isOn() === false && !G.hasKey() && G.getConfig().model === 'gemini-2.5-flash', 'bawaan: online MATI, tanpa kunci, model gemini-2.5-flash');
  let r = await G.lyrics('lagu galau'); ok(r.error === 'online-disabled' && calls.length === 0, 'mati -> online-disabled, 0 permintaan jaringan');
  G.enable(true); r = await G.lyrics('lagu galau'); ok(r.error === 'no-key' && calls.length === 0, 'tanpa kunci -> no-key, 0 permintaan jaringan');
  ok(!G.setKey('pendek').ok && !G.setKey('ada spasi di sini 123456789').ok && !G.setKey('kunci/dengan/garis/miring12345').ok && G.setKey('  ' + KEY + ' ').ok && G.hasKey() && G.keyHint() === '…1234' && !G.keyHint().includes('TESTKEY'), 'validasi kunci; petunjuk hanya 4 karakter terakhir');
  r = await G.lyrics('   '); ok(r.error === 'empty', 'permintaan kosong ditolak sebelum dikirim');
  r = await G.lyrics('x'.repeat(301)); ok(r.error === 'too-long' && calls.length === 0, 'permintaan > 300 karakter ditolak sebelum dikirim');
  ok(['gemini-2.5-flash', 'gemini-2.0-flash-001', 'gemini-exp_1'].every(G.checkModel) && ['', 'a/b', 'x?y=1', 'gemini:evil', 'Gemini', 'a b', '../x', 'm'.repeat(61)].every(m => !G.checkModel(m)), 'nama model: hanya karakter aman (tanpa / ? : spasi) karena masuk jalur URL');
  ok(!G.setConfig({ model: 'a/b?x' }).ok && G.getConfig().model === 'gemini-2.5-flash' && G.setConfig({ model: 'gemini-2.0-flash' }).ok && G.getConfig().model === 'gemini-2.0-flash' && G.setConfig({ model: '' }).ok && G.getConfig().model === 'gemini-2.5-flash', 'model buruk ditolak; model sendiri tersimpan; kosong = kembali ke bawaan');

  // ---------- 2. bentuk permintaan
  const rq = G.buildRequest('lagu galau chord gampang'), body = JSON.parse(rq.init.body);
  ok(rq.url === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent' && rq.init.method === 'POST', 'URL tetap: host Google + v1beta/models/{model}:generateContent, POST');
  ok(rq.init.headers['x-goog-api-key'] === KEY && !rq.url.includes('TESTKEY') && !rq.init.body.includes('TESTKEY') && !('Authorization' in rq.init.headers), 'kunci HANYA di header x-goog-api-key; tidak ada di URL maupun badan');
  ok(body.contents.length === 1 && body.contents[0].role === 'user' && body.contents[0].parts[0].text === 'Permintaan lagu: lagu galau chord gampang', 'badan: satu pesan pengguna berisi permintaan');
  const sys = body.systemInstruction.parts[0].text; ok(/penulis lagu/.test(sys) && /Judul:/.test(sys) && /Lirik:/.test(sys) && /Chord/.test(sys) && /galau/.test(sys) && /C, G, Am, F/.test(sys) && /Jangan menyalin lirik/.test(sys), 'instruksi sistem: penulis lagu, format Judul/Lirik/Chord, default galau, chord gampang, jangan menyalin lirik');
  ok(body.generationConfig.maxOutputTokens === 2048 && !('audio' in body) && !JSON.stringify(body).includes('papan klip'), 'batas token keluaran; tidak ada data lain di badan');

  // ---------- 3. jalan sukses & parsing
  const LAGU = 'Judul: Hujan di Matamu\n\nLirik:\n[Verse 1]\nSenja pergi\n\nChord (gampang):\nC G Am F';
  impl = () => resp(200, okBody(LAGU));
  r = await G.lyrics('  lagu   galau\nchord gampang '); ok(r.ok && r.text === LAGU && r.model === 'gemini-2.5-flash' && calls.length === 1 && calls[0].body.contents[0].parts[0].text === 'Permintaan lagu: lagu galau chord gampang', 'sukses: teks terbaca, model dilaporkan, spasi dirapikan, tepat 1 permintaan');
  r = await G.lyrics('lagi'); ok(r.error === 'too-fast' && calls.length === 1, 'jeda minimal 1 dtk: permintaan beruntun ditolak sebelum dikirim');
  await sleep(1010); impl = () => resp(200, okBody('```\nJudul: A\n```')); r = await G.lyrics('a'); ok(r.ok && r.text === 'Judul: A', 'pagar ``` di sekitar jawaban dibuang');
  await sleep(1010); impl = () => resp(200, { candidates: [{ content: { parts: [{ text: 'Judul: ' }, { text: 'Dua bagian' }] }, finishReason: 'MAX_TOKENS' }] }); r = await G.lyrics('a'); ok(r.ok && r.text === 'Judul: Dua bagian' && r.truncated === true, 'bagian-bagian teks digabung; MAX_TOKENS -> truncated, tetap dikembalikan');
  await sleep(1010); impl = () => resp(200, okBody('Z'.repeat(9000))); r = await G.lyrics('a'); ok(r.ok && r.text.length === 8000 && r.truncated, 'keluaran dibatasi 8000 karakter');

  // ---------- 4. galat
  const cases = [[400, 'API key not valid. Please pass a valid API key.', 'key-rejected'], [400, 'Invalid JSON payload', 'bad-request'], [401, 'x', 'key-rejected'], [403, 'x', 'key-rejected'], [404, 'models/gemini-1.5-flash is not found', 'model-404'], [429, 'quota', 'rate-limited'], [500, 'x', 'server-error'], [503, 'overloaded', 'server-error'], [418, 'x', 'http-418']];
  for (const [st, m, er] of cases) { await sleep(1010); impl = () => resp(st, { error: { code: st, message: m + ' ' + 'x'.repeat(400) } }); r = await G.lyrics('a'); ok(!r.ok && r.error === er && r.detail.length <= 200, 'HTTP ' + st + ' -> ' + er + ' (detail <= 200 karakter)'); }
  await sleep(1010); impl = () => resp(400, { error: { message: 'bad ' + KEY + ' leak' } }); r = await G.lyrics('a'); ok(!JSON.stringify(r).includes('TESTKEY') && r.detail.includes('***'), 'kunci yang kebetulan ada di pesan galat server disamarkan');
  await sleep(1010); impl = () => resp(200, { promptFeedback: { blockReason: 'SAFETY' } }); r = await G.lyrics('a'); ok(r.error === 'blocked', 'diblokir filter (promptFeedback) -> blocked');
  await sleep(1010); impl = () => resp(200, { candidates: [{ finishReason: 'SAFETY' }] }); r = await G.lyrics('a'); ok(r.error === 'blocked', 'finishReason SAFETY tanpa teks -> blocked');
  await sleep(1010); impl = () => resp(200, { candidates: [] }); r = await G.lyrics('a'); ok(r.error === 'empty-answer', 'tanpa kandidat -> empty-answer (bukan crash seperti data.candidates[0] mentah)');
  await sleep(1010); impl = () => resp(200, 'bukan json'); r = await G.lyrics('a'); ok(r.error === 'empty-answer', 'balasan bukan JSON -> empty-answer, tidak melempar');
  await sleep(1010); impl = () => Promise.reject(new TypeError('Failed to fetch')); r = await G.lyrics('a'); ok(r.error === 'network', 'jaringan putus -> network');
  await sleep(1010); impl = (u, i) => new Promise((res, rej) => i.signal.addEventListener('abort', () => { const e = new Error('abort'); e.name = 'AbortError'; rej(e); }));
  const realST = global.setTimeout; global.setTimeout = (f, ms) => realST(f, ms === 30000 ? 40 : ms); r = await G.lyrics('a'); global.setTimeout = realST; ok(r.error === 'timeout', 'server tak menjawab -> timeout (AbortController)');
  await sleep(1010); let rel; impl = () => new Promise(res => { rel = () => res(resp(200, okBody('ok'))); }); const p1 = G.lyrics('a'); const p2 = await G.lyrics('b'); ok(p2.error === 'busy', 'permintaan kedua saat yang pertama jalan -> busy'); await sleep(5); rel(); await p1;
  const n = calls.length; G.enable(false); r = await G.lyrics('a'); ok(r.error === 'online-disabled' && calls.length === n, 'dimatikan lagi -> berhenti total');
  G.clearKey(); ok(!G.hasKey() && !('gw_gemini_key' in ls), 'hapus kunci benar-benar menghapus dari penyimpanan');

  // ---------- 5. penyimpanan offline
  ok(S.splitTitle(LAGU) === 'Hujan di Matamu' && S.splitTitle('**Judul:** "Bulan Sabit"\nx') === 'Bulan Sabit' && S.splitTitle('\n\nBaris pertama\nx') === 'Baris pertama' && S.splitTitle('') === '(tanpa judul)', 'judul diambil dari "Judul:" / baris pertama');
  ok(S.count() === 0 && S.add({ text: '  ' }).error === 'empty', 'awal kosong; teks kosong tidak disimpan');
  let a = S.add({ prompt: 'galau', text: LAGU, model: 'gemini-2.5-flash' }); ok(a.ok && a.total === 1 && a.item.title === 'Hujan di Matamu' && S.count() === 1 && S.get(a.item.id).text === LAGU && JSON.parse(ls.gw_lyrics_v1).length === 1, 'simpan: judul diturunkan, tersimpan di localStorage gw_lyrics_v1');
  await sleep(3); S.add({ prompt: 'ceria', text: 'Judul: Kedua\nx' }); ok(S.list()[0].title === 'Kedua' && S.list().length === 2, 'daftar: terbaru di atas');
  ok(S.remove(a.item.id).ok && S.count() === 1 && S.remove('nope').error === 'not-found', 'hapus satu lagu; id tak dikenal -> not-found');
  ls.gw_lyrics_v1 = '{"bukan":"array"}'; ok(S.list().length === 0, 'data rusak (bukan array) diabaikan, tidak melempar'); ls.gw_lyrics_v1 = JSON.stringify([{ id: 'a', text: 't', title: 'T' }, { id: 5 }, null, 'x']); ok(S.list().length === 1, 'entri asing disaring');
  S.clear(); for (let i = 0; i < 205; i++) { S.add({ text: 'Judul: L' + i + '\nx' }); } ok(S.count() === 200, 'dibatasi 200 lagu (yang terlama dibuang)');
  S.clear(); quotaLeft = 0; a = S.add({ text: LAGU }); ok(!a.ok && a.error === 'storage-full', 'penyimpanan penuh -> galat jelas, tidak melempar'); quotaLeft = Infinity;
  S.clear(); S.add({ text: 'Judul: Lama\n' + 'a'.repeat(3000) }); await sleep(3); quotaLeft = ls.gw_lyrics_v1.length + 50; a = S.add({ text: 'Judul: Baru\nb' }); ok(a.ok && S.list().map(x => x.title).join() === 'Baru', 'kuota sempit: yang terlama dibuang supaya yang baru tersimpan'); quotaLeft = Infinity;
  const saveLs = global.localStorage; global.localStorage = undefined; ok(S.add({ text: LAGU }).error === 'storage-unavailable' && S.count() === 0, 'tanpa localStorage -> storage-unavailable'); global.localStorage = saveLs;

  // ---------- 6. integrasi index.html / sw.js / build
  const HTML = rd('www/index.html'), SW = rd('www/sw.js'), ly = /const LY_MODS = \[([^\]]+)\]/.exec(HTML), mods = ly ? ly[1].match(/lib\/[a-z\/-]+\.js/g) : [];
  ok(mods.length === 4 && mods.every(m => fs.existsSync(path.join(LIB, m.slice(4))) && fs.readFileSync(path.join(LIB, m.slice(4)), 'utf8') === rd('www/' + m) && SW.includes("'" + m + "'")), 'index.html memuat 4 modul Lirik AI berurutan: ada di src/lib, identik di www/lib, ada di cache sw.js');
  ok(/id="lyricsBtn"/.test(HTML) && /loadLyrics\(\)\.then/.test(HTML) && !/<script[^>]*lib\/online\/gemini/.test(HTML) && (HTML.match(/loadLyrics\(/g) || []).length === 2, 'tombol "Lirik AI" ada; modul online dimuat HANYA saat diketuk, bukan saat keyboard mulai');
  ok(!SW.includes('spark.js') && +SW.match(/cache-v(\d+)/)[1] >= 34, 'sw.js: spark.js dihapus, cache dinaikkan');
  { const v = JSON.parse(rd('package.json')).version.split('.').map(Number); ok(v[0] > 1 || (v[0] === 1 && v[1] >= 8), 'package.json versi >= 1.8.0'); }

  // ---------- 7. panel (DOM tiruan)
  const byId = {}; class El { constructor(t) { this.tag = t; this.children = []; this.style = {}; this._text = ''; this.handlers = {}; this.value = ''; this.className = ''; this.disabled = false; this.attrs = {}; }
    set id(v) { this._id = v; byId[v] = this; } get id() { return this._id; } set textContent(v) { this._text = String(v); } get textContent() { return this._text; }
    appendChild(c) { this.children.push(c); return c; } removeChild(c) { this.children = this.children.filter(x => x !== c); return c; } get firstChild() { return this.children[0] || null; }
    setAttribute(k, v) { this.attrs[k] = v; } addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); } click() { (this.handlers.click || []).forEach(f => f({})); } }
  global.document = { head: new El('head'), body: new El('body'), createElement: t => new El(t), getElementById: id => byId[id] || null };
  global.localStorage = saveLs; for (const k of Object.keys(ls)) delete ls[k];
  (0, eval)(fs.readFileSync(path.join(LIB, 'ui/lyrics-panel.js'), 'utf8')); ok(typeof global.gwLyricsOpen === 'function', 'panel terdaftar (gwLyricsOpen)');
  const all = e => [e].concat(...e.children.map(all)), bn = n => all(byId.gwLyPanel).find(e => e.tag === 'button' && e._text === n);
  const typed = []; global.AndroidKeyboard = { commitText: t => typed.push(t) };
  global.gwLyricsOpen(); const st0 = byId['gwly-status'].textContent;
  ok(byId.gwLyPanel.style.display === 'block' && /Gemini online: mati/.test(st0) && /kunci belum ada/.test(st0) && /Tersimpan offline: 0 lagu/.test(st0) && byId['gwly-prompt'].placeholder === 'cth: bikinin lagu galau chord gampang', 'panel: status jujur (online mati, tanpa kunci, 0 tersimpan), placeholder dari contoh pengguna');
  ok(all(byId.gwLyPanel).filter(e => e.tag === 'input' && e.type === 'password').length === 1 && !!bn('Bikin Lagu'), 'ada tombol "Bikin Lagu"; kolom kunci bertipe password');
  const nc = calls.length; byId['gwly-prompt'].value = 'lagu galau'; bn('Bikin Lagu').click(); await sleep(20);
  ok(/Gemini online belum dinyalakan/.test(byId['gwly-note'].textContent) && calls.length === nc && !byId['gwly-go'].disabled, 'tekan Bikin Lagu saat mati: pesan jelas, 0 jaringan, tombol aktif lagi');
  byId['gwly-key'].value = 'pendek'; bn('Simpan kunci/model').click(); ok(/Kunci tidak valid/.test(byId['gwly-note'].textContent), 'kunci pendek ditolak dengan pesan');
  byId['gwly-key'].value = KEY; byId['gwly-model'].value = 'gemini-2.0-flash'; bn('Simpan kunci/model').click(); ok(byId['gwly-note'].textContent === 'Tersimpan.' && byId['gwly-key'].value === '' && /kunci …1234/.test(byId['gwly-status'].textContent) && /model gemini-2\.0-flash/.test(byId['gwly-status'].textContent), 'kunci + model tersimpan; kolom kunci dikosongkan; hanya 4 karakter terakhir tampil');
  bn('Nyalakan online').click(); ok(!G.isOn() && /Yakin\?/.test(byId['gwly-toggle'].textContent), 'menyalakan online: ketukan pertama hanya minta konfirmasi');
  byId['gwly-toggle'].click(); ok(G.isOn() && /NYALA/.test(byId['gwly-status'].textContent), 'ketukan kedua menyalakan');
  const HOSTILE = 'Judul: <img src=x onerror=alert(1)>\n\nLirik:\n[Verse 1]\n<script>x</script>\n\nChord: C G Am F';
  await sleep(1010); impl = () => resp(200, okBody(HOSTILE)); const before = calls.length; bn('Bikin Lagu').click(); await sleep(30);
  ok(calls.length === before + 1 && byId['gwly-out'].textContent === HOSTILE && !all(byId.gwLyPanel).some(e => e.tag === 'img' || e.tag === 'script'), 'sukses: lirik tampil sebagai TEKS biasa (judul/skrip berbahaya tidak menjadi elemen)');
  ok(/✓ Tersimpan offline \(1 lagu\)/.test(byId['gwly-note'].textContent) && /ONLINE/.test(byId['gwly-note'].textContent) && /Tersimpan offline: 1 lagu/.test(byId['gwly-status'].textContent) && S.count() === 1, 'otomatis tersimpan offline + keterangan model/ONLINE + hitungan diperbarui');
  ok(all(byId['gwly-saved']).some(e => e._text.startsWith('Judul: <img')) || all(byId['gwly-saved']).some(e => e._text.includes('<img src=x')), 'lagu muncul di daftar tersimpan (judul sebagai teks)');
  bn('Ketik hasil').click(); ok(typed.length === 1 && typed[0] === HOSTILE, '"Ketik hasil" mengirim lirik ke kolom teks lewat commitText');
  // offline total: fetch meledak, daftar tersimpan tetap terbuka
  global.fetch = () => { throw new Error('OFFLINE'); }; const nb = calls.length; byId['gwly-out'].textContent = ''; const song = all(byId['gwly-saved']).find(e => e.tag === 'button' && e.className === 'song'); song.click();
  ok(byId['gwly-out'].textContent === HOSTILE && /penyimpanan offline/.test(byId['gwly-note'].textContent) && calls.length === nb, 'membuka lagu tersimpan: tanpa jaringan sama sekali');
  await sleep(1010); bn('Bikin Lagu').click(); await sleep(20); ok(/Tidak ada koneksi/.test(byId['gwly-note'].textContent) && /tetap bisa dibuka/.test(byId['gwly-note'].textContent), 'internet mati: pesan jujur + petunjuk bahwa lagu tersimpan tetap bisa dibuka');
  const del = all(byId['gwly-saved']).find(e => e.tag === 'button' && e._text === '🗑'); del.click(); ok(S.count() === 1 && del._text === 'Hapus?', 'hapus lagu: ketukan pertama hanya konfirmasi'); del.click(); ok(S.count() === 0 && /Tersimpan offline: 0 lagu/.test(byId['gwly-status'].textContent), 'ketukan kedua menghapus');
  bn('Hapus kunci').click(); bn('Matikan online').click(); ok(!G.hasKey() && !G.isOn(), 'hapus kunci dan matikan online lewat panel');
  global.gwLyricsClose(); ok(byId.gwLyPanel.style.display === 'none', 'Tutup menyembunyikan panel');

  console.log(fail ? '\n' + fail + ' dari ' + total + ' GAGAL' : '\nSEMUA LULUS (' + total + ' pemeriksaan lirik)'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR UJI:', e); process.exit(1); });
