// Uji CADANGAN CLOUD (v1.7.1): www/player/cloud.js dengan fetch PALSU — tidak ada permintaan ke Firebase sungguhan.
// Yang dibuktikan: bentuk permintaan, apa yang TIDAK ikut terkirim, batas-batas keamanan, penanganan galat.
// Yang TIDAK dibuktikan: bahwa server Firestore sungguhan menerimanya (itu butuh jaringan + proyek Firebase).
// Jalankan: node tools/cloud-test.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SRC = fs.readFileSync(path.join(ROOT, 'www/player/cloud.js'), 'utf8'), PLAYER = fs.readFileSync(path.join(ROOT, 'www/player/songplayer.js'), 'utf8');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('GAGAL:', m); } else console.log('ok   :', m); };

// ---- statis
ok(!/getAnalytics|firebase\/analytics|gtag|analytics\.js|measurement/i.test(SRC.replace(/measurementId: 'G-[A-Z0-9]+',?\s*\/\/[^\n]*/, '')), 'tidak ada Firebase Analytics (hanya measurementId yang disimpan, tidak dipakai)');
const urls = SRC.match(/https?:\/\/[^\s'"`)]+/g) || [];
ok(urls.length > 0 && urls.every(u => u.startsWith('https://firestore.googleapis.com') || u.startsWith('https://firebase')) , 'URL di cloud.js hanya host Google/Firebase: ' + [...new Set(urls)].join(', '));
ok(/const|var HOST = 'https:\/\/firestore\.googleapis\.com'/.test(SRC) && !/http:\/\//.test(SRC), 'permintaan hanya lewat https ke satu host (firestore.googleapis.com)');
ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|https?:\/\//.test(PLAYER), 'songplayer.js tetap bebas jaringan (semua jaringan hanya di cloud.js)');
ok(!/setInterval|onKeyboardShown|onSongState/.test(SRC), 'tidak ada sinkron otomatis/berkala: hanya jalan saat tombol diketuk');

// ---- lingkungan palsu
const mem = {}; global.window = global; global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
const reqs = []; let handler = null; global.fetch = (url, init) => { reqs.push({ url, init: init || {}, body: init && init.body ? JSON.parse(init.body) : null }); return handler(url, init || {}, reqs.length); };
const resp = (status, json, text) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (json === undefined) throw new SyntaxError('bukan json'); return json; }, text: async () => text != null ? text : JSON.stringify(json) });
(0, eval)(fs.readFileSync(path.join(ROOT, 'www/player/cloud.js'), 'utf8'));
const G = window.GWCLOUD; G._cfg.minGapMs = 0;
const docsOf = (dev, arr) => arr.map(([t, s, b]) => ({ name: `projects/guitarwiter/databases/(default)/documents/devices/${dev}/songs/${G._hash(s + '|' + t)}`, fields: { title: { stringValue: t }, src: { stringValue: s }, bytes: { integerValue: String(b) } } }));

(async () => {
  // bawaan mati
  let r = await G.backup([{ title: 'A', src: 'app', size: 1 }]);
  ok(!G.isEnabled() && r.error === 'disabled' && reqs.length === 0, 'bawaan MATI: backup ditolak, 0 permintaan jaringan');
  r = await G.list(); const r2 = await G.wipe(); ok(r.error === 'disabled' && r2.error === 'disabled' && reqs.length === 0, 'list/wipe juga ditolak saat mati');
  G.setEnabled(true); const dev = G.deviceId();
  ok(/^[a-z0-9]{20}$/.test(dev) && G.deviceId() === dev && JSON.parse(mem.gw_cloud_v1).dev === dev, 'id perangkat: 20 karakter acak, stabil, tersimpan lokal');

  // backup pertama: cloud kosong -> tulis semua
  const SONGS = [{ id: 'f:satu.mp3', title: 'Satu', src: 'app', size: 3145728 }, { id: 'u:content://com.android.externalstorage.documents/tree/1%3AMusic/document/1%3AMusic%2Fdua.flac', title: 'Dua', src: 'Music', size: 900 },
    { id: 'f:<img>.mp3', title: '<img src=x onerror=alert(1)>', src: 'app', size: 5 }, { id: 'f:satu2.mp3', title: 'Satu', src: 'app', size: 3145728 }, { id: 'f:x', title: '', src: 'app', size: 1 }];
  handler = (url, init) => Promise.resolve(init.method === 'GET' ? resp(200, {}) : resp(200, {}));
  r = await G.backup(SONGS);
  ok(r.ok && r.total === 3 && r.written === 3 && r.deleted === 0, 'backup: duplikat (judul+folder sama) digabung, judul kosong dibuang -> 3 ditulis: ' + JSON.stringify(r));
  const get = reqs[0], post = reqs[1];
  ok(get.init.method === 'GET' && get.url.startsWith('https://firestore.googleapis.com/v1/projects/guitarwiter/databases/(default)/documents/devices/' + dev + '/songs?pageSize=300') && get.url.includes('key=AIzaSyB0hxPPgiXATF0QTpHum1rChjcCcQJTrJY'), 'GET daftar: host, proyek, jalur devices/{id}/songs, kunci API sebagai parameter');
  ok(post.init.method === 'POST' && post.url === 'https://firestore.googleapis.com/v1/projects/guitarwiter/databases/(default)/documents:commit?key=AIzaSyB0hxPPgiXATF0QTpHum1rChjcCcQJTrJY', 'POST commit ke endpoint :commit');
  const w = post.body.writes; ok(w.length === 3 && w.every(x => x.update.name.startsWith('projects/guitarwiter/databases/(default)/documents/devices/' + dev + '/songs/')), 'semua dokumen di bawah devices/{id}/songs/');
  ok(w.every(x => Object.keys(x.update.fields).sort().join() === 'bytes,src,title,updatedAt'), 'dokumen hanya punya 4 kolom: title, src, bytes, updatedAt');
  const bodyStr = JSON.stringify(post.body);
  ok(!/content:\/\/|f:satu|u:content|externalstorage|tree\/|\/sdcard|Android\/data/.test(bodyStr), 'id lagu, URI, dan path berkas TIDAK ikut terkirim');
  ok(w.some(x => x.update.fields.title.stringValue === '<img src=x onerror=alert(1)>') && w.find(x => x.update.fields.title.stringValue === 'Dua').update.fields.bytes.integerValue === '900', 'judul dikirim apa adanya sebagai string; ukuran sebagai integerValue');
  ok(w.every(x => /^[0-9a-f]{14}$/.test(x.update.name.split('/').pop())), 'ID dokumen = hash heks 14 karakter (aman untuk Firestore)');
  ok(!bodyStr.includes('audio') && !bodyStr.includes('base64'), 'tidak ada data audio');

  // backup kedua: sebagian sudah ada & tidak berubah, satu berubah, satu usang -> hanya selisih
  reqs.length = 0;
  handler = (url, init) => Promise.resolve(init.method === 'GET' ? resp(200, { documents: docsOf(dev, [['Satu', 'app', 3145728], ['Dua', 'Music', 111], ['Lama', 'app', 7]]) }) : resp(200, {}));
  r = await G.backup(SONGS);
  const w2 = reqs[1].body.writes;
  ok(r.ok && r.written === 2 && r.deleted === 1 && w2.filter(x => x.update).length === 2 && w2.filter(x => x.delete).length === 1, 'backup lanjutan: yang tak berubah dilewati, yang berubah ditulis, yang usang dihapus: ' + JSON.stringify(r));
  ok(w2.find(x => x.delete).delete.endsWith('/' + G._hash('app|Lama')), 'penghapusan menunjuk dokumen "Lama"');
  ok(w2.every(x => !x.delete || x.delete.includes('/devices/' + dev + '/')), 'penghapusan hanya di bawah id perangkat ini');

  // tidak ada perubahan -> tidak ada POST
  reqs.length = 0; handler = (url, init) => Promise.resolve(resp(200, { documents: docsOf(dev, [['Satu', 'app', 3145728], ['Dua', 'Music', 900], ['<img src=x onerror=alert(1)>', 'app', 5]]) }));
  r = await G.backup(SONGS); ok(r.ok && r.written === 0 && r.deleted === 0 && reqs.length === 1 && reqs[0].init.method === 'GET', 'tanpa perubahan: hanya 1 GET, tidak ada penulisan');

  // paginasi
  reqs.length = 0; handler = (url, init) => Promise.resolve(resp(200, url.includes('pageToken=P2') ? { documents: docsOf(dev, [['B', 'app', 2]]) } : { documents: docsOf(dev, [['A', 'app', 1]]), nextPageToken: 'P2' }));
  r = await G.list(); ok(r.ok && r.items.map(i => i.title).join() === 'A,B' && reqs.length === 2 && reqs[1].url.includes('pageToken=P2'), 'list: mengikuti nextPageToken dan mengurutkan judul');

  // potongan 400 penulisan per commit
  reqs.length = 0; handler = (url, init) => Promise.resolve(resp(200, {}));
  const many = Array.from({ length: 950 }, (_, i) => ({ title: 'Lagu ' + i, src: 'app', size: i })); r = await G.backup(many);
  const posts = reqs.filter(q => q.init.method === 'POST'); ok(r.ok && r.total === 950 && posts.length === 3 && posts.every(p => p.body.writes.length <= 400), 'commit dipotong maksimal 400 penulisan: ' + posts.map(p => p.body.writes.length));
  reqs.length = 0; r = await G.backup(Array.from({ length: 2600 }, (_, i) => ({ title: 'X' + i, src: 'a', size: 1 }))); ok(r.total === 2000, 'daftar dibatasi 2000 lagu');

  // wipe
  reqs.length = 0; handler = (url, init) => Promise.resolve(init.method === 'GET' ? resp(200, { documents: docsOf(dev, [['A', 'app', 1], ['B', 'app', 2]]) }) : resp(200, {}));
  r = await G.wipe(); ok(r.ok && r.deleted === 2 && reqs[1].body.writes.length === 2 && reqs[1].body.writes.every(x => x.delete), 'wipe: menghapus semua dokumen milik perangkat ini');

  // galat
  const errCase = async (status, code) => { handler = () => Promise.resolve(resp(status, { error: { message: 'x'.repeat(500) } })); const x = await G.list(); return x.error === code && (x.detail || '').length <= 200; };
  ok(await errCase(403, 'permission-denied') && /10 Des 2026/.test(G.message('permission-denied')), '403 -> permission-denied, pesan menyebut aturan kedaluwarsa 10 Des 2026; detail dipotong 200 karakter');
  ok(await errCase(401, 'unauthorized') && await errCase(404, 'not-found') && await errCase(429, 'rate-limited') && await errCase(503, 'server-error') && await errCase(400, 'bad-request'), '401/404/429/5xx/400 dipetakan ke kode galat yang jelas');
  handler = () => Promise.reject(new TypeError('Failed to fetch')); r = await G.list(); ok(r.error === 'network', 'jaringan putus -> network');
  handler = () => Promise.resolve(resp(200, undefined)); r = await G.list(); ok(r.error === 'network', 'balasan bukan JSON (mis. halaman cadangan service worker) -> network, tidak melempar');
  handler = (u, init) => new Promise((_, rej) => { init.signal.addEventListener('abort', () => { const e = new Error('abort'); e.name = 'AbortError'; rej(e); }); });
  const realST = global.setTimeout; global.setTimeout = (f, ms) => realST(f, ms === 15000 ? 5 : ms); r = await G.list(); global.setTimeout = realST; ok(r.error === 'timeout', 'batas waktu 15 dtk -> timeout (dipercepat di tes)');
  const msgs = ['disabled', 'busy', 'too-fast', 'unauthorized', 'permission-denied', 'not-found', 'bad-request', 'rate-limited', 'server-error', 'timeout', 'network']; ok(msgs.every(c => !G.message(c).startsWith('Gagal:')), 'semua kode galat punya pesan Indonesia');

  // penjaga: satu permintaan sekaligus + jeda minimal
  reqs.length = 0; let release; handler = () => new Promise(res => { release = () => res(resp(200, {})); });
  const p1 = G.list(); const p2 = await G.list(); ok(p2.error === 'busy', 'permintaan kedua saat yang pertama berjalan -> busy'); await new Promise(q => setTimeout(q, 10)); release(); await p1;
  G._cfg.minGapMs = 60000; handler = () => Promise.resolve(resp(200, {})); r = await G.list(); ok(r.error === 'too-fast' && reqs.length === 1, 'jeda minimal antar permintaan -> too-fast, tanpa permintaan baru'); G._cfg.minGapMs = 0;
  const before = reqs.length; G.setEnabled(false); r = await G.backup(SONGS); ok(r.error === 'disabled' && reqs.length === before, 'dimatikan lagi -> berhenti total, 0 permintaan');
  ok(JSON.parse(mem.gw_cloud_v1).dev === dev, 'mematikan tidak mengganti id perangkat (cadangan lama tetap bisa dihapus)');

  console.log(fail ? '\n' + fail + ' GAGAL' : '\nSEMUA LULUS'); process.exit(fail ? 1 : 0);
})();
