/* ============================================================================================
 * [LABEL SONGS / CLOUD] www/player/cloud.js  (v1.7.1)
 * Cadangan DAFTAR lagu ke Google Firebase (Cloud Firestore) — OPSIONAL, ONLINE, mati secara bawaan.
 * Ini SATU-SATUNYA berkas pemutar lagu yang boleh menyentuh jaringan (songplayer.js tetap bebas jaringan; dijaga tools/cloud-test.js).
 *
 * Yang dikirim: judul, nama folder ("app" / nama folder pilihan), ukuran (byte), waktu. TIDAK dikirim: berkas audio,
 * path/URI berkas, id lagu, isi ketikan, mikrofon. Audio tetap disimpan di HP (folder aplikasi / folder pilihan).
 * Tidak memakai Firebase JS SDK (proyek ini tidak punya bundler; halaman statis di www/): memanggil REST API Firestore
 * lewat https ke satu host saja. Firebase Analytics SENGAJA tidak dipasang (kebijakan privasi: tanpa analitik).
 *
 * Aturan pemakaian (semua dipaksa kode):  hanya setelah dinyalakan pengguna · hanya saat tombol diketuk (tanpa sinkron otomatis) ·
 * satu permintaan sekaligus · jeda minimal 2 dtk · batas waktu 15 dtk · tanpa percobaan ulang otomatis · maks 2000 lagu.
 * Penyimpanan di Firestore:  devices/{deviceId}/songs/{hash}  — deviceId = 20 karakter acak yang dibuat di HP ini.
 *   window.GWCLOUD = { isEnabled, setEnabled, deviceId, backup(songs), list(), wipe(), message(code) }
 * ============================================================================================ */
(function (root) {
  'use strict';
  if (root.GWCLOUD) return;

  // Konfigurasi web app Firebase (nilai dari konsol Firebase proyek "guitarwiter"). Ini kunci KLIEN yang memang publik:
  // keamanannya ada di aturan Firestore (lihat firebase/firestore.rules), bukan di kerahasiaan kunci.
  // Hanya apiKey + projectId yang dipakai; sisanya disimpan supaya konfigurasi lengkap tetap di satu tempat.
  var FIREBASE_CONFIG = Object.freeze({
    apiKey: 'AIzaSyB0hxPPgiXATF0QTpHum1rChjcCcQJTrJY',
    authDomain: 'guitarwiter.firebaseapp.com',
    projectId: 'guitarwiter',
    storageBucket: 'guitarwiter.firebasestorage.app',
    messagingSenderId: '606315417984',
    appId: '1:606315417984:web:961ce38b419842eddcb165',
    measurementId: 'G-08TR68XZNS'   // TIDAK dipakai: Analytics tidak dipasang
  });

  var HOST = 'https://firestore.googleapis.com';
  var STORE_KEY = 'gw_cloud_v1', MAX_SONGS = 2000, CHUNK = 400, PAGE = 300, MAX_PAGES = 10, TIMEOUT_MS = 15000;
  var C = { minGapMs: 2000 };   // diubah hanya oleh tes
  var busy = false, lastAt = 0;

  // ---------------------------------------------------------------- penyimpanan lokal (aktif/tidak + id perangkat)
  function readStore() { try { var o = JSON.parse(root.localStorage.getItem(STORE_KEY) || 'null'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function writeStore(o) { try { root.localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) { } }
  function isEnabled() { return readStore().on === true; }
  function setEnabled(on) { var o = readStore(); o.on = !!on; writeStore(o); return o.on; }
  function deviceId() {
    var o = readStore();
    if (typeof o.dev === 'string' && /^[a-z0-9]{20}$/.test(o.dev)) return o.dev;
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', id = '', i, b = new Uint8Array(20);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(b); else for (i = 0; i < 20; i++) b[i] = Math.floor(Math.random() * 256);
    for (i = 0; i < 20; i++) id += chars.charAt(b[i] % 36);
    o.dev = id; writeStore(o); return id;
  }

  // ---------------------------------------------------------------- bantu
  function hash(str) {   // cyrb53 -> 14 heks; ID dokumen Firestore (tanpa '/', bukan '.' / '..')
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57, ch, i;
    for (i = 0; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    var s = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16); while (s.length < 14) s = '0' + s; return s;
  }
  function base() { return 'projects/' + FIREBASE_CONFIG.projectId + '/databases/(default)/documents'; }
  function collUrl(dev) { return HOST + '/v1/' + base() + '/devices/' + dev + '/songs'; }
  function docName(dev, h) { return base() + '/devices/' + dev + '/songs/' + h; }
  function withKey(url) { return url + (url.indexOf('?') < 0 ? '?' : '&') + 'key=' + encodeURIComponent(FIREBASE_CONFIG.apiKey); }
  function status(code) {
    return code === 400 || code === 422 ? 'bad-request' : code === 401 ? 'unauthorized' : code === 403 ? 'permission-denied' : code === 404 ? 'not-found'
      : code === 409 ? 'conflict' : code === 429 ? 'rate-limited' : code >= 500 ? 'server-error' : 'http-' + code;
  }
  var MSG = {
    'disabled': 'Cadangan cloud belum dinyalakan.', 'busy': 'Masih memproses permintaan sebelumnya.', 'too-fast': 'Terlalu cepat; tunggu 2 detik.',
    'unauthorized': 'Kunci API ditolak (401). Periksa pembatasan kunci di Google Cloud Console.',
    'permission-denied': 'Ditolak Firebase (403). Aturan Firestore kemungkinan sudah kedaluwarsa (aturan awal hanya berlaku sampai 10 Des 2026) atau belum mengizinkan jalur devices/…/songs. Pasang aturan dari firebase/firestore.rules.',
    'not-found': 'Database Firestore belum dibuat di proyek ini (404). Buat dulu di konsol Firebase.', 'bad-request': 'Permintaan ditolak (400/422).',
    'rate-limited': 'Kena batas laju (429). Tunggu sebentar.', 'server-error': 'Server Firebase bermasalah (5xx).', 'timeout': 'Waktu habis.',
    'network': 'Tidak ada koneksi (atau balasan tidak terbaca).', 'conflict': 'Bentrok penulisan (409). Coba lagi.'
  };
  function message(code) { return MSG[code] || ('Gagal: ' + code); }

  function request(method, url, body) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    var init = { method: method }; if (ctl) init.signal = ctl.signal;
    if (body !== undefined) { init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(body); }
    var done = function (r) { clearTimeout(timer); return r; };
    return Promise.resolve().then(function () { return root.fetch(withKey(url), init); }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { return done({ ok: false, error: status(res.status), http: res.status, detail: String(t || '').slice(0, 200) }); });
      return res.json().then(function (j) { return done({ ok: true, json: j }); });
    }).catch(function (e) { return done({ ok: false, error: e && e.name === 'AbortError' ? 'timeout' : 'network' }); });
  }
  function run(fn) {
    if (!isEnabled()) return Promise.resolve({ ok: false, error: 'disabled' });
    if (busy) return Promise.resolve({ ok: false, error: 'busy' });
    if (Date.now() - lastAt < C.minGapMs) return Promise.resolve({ ok: false, error: 'too-fast' });
    busy = true; lastAt = Date.now();
    return Promise.resolve().then(fn).then(function (r) { busy = false; return r; }, function () { busy = false; return { ok: false, error: 'network' }; });
  }
  function str(f, k) { return f && f[k] && typeof f[k].stringValue === 'string' ? f[k].stringValue : ''; }
  function listAll(dev) {
    var docs = [], page = 0;
    function next(token) {
      var url = collUrl(dev) + '?pageSize=' + PAGE + (token ? '&pageToken=' + encodeURIComponent(token) : '');
      return request('GET', url).then(function (r) {
        if (!r.ok) return r;
        (Array.isArray(r.json.documents) ? r.json.documents : []).forEach(function (d) {
          if (d && typeof d.name === 'string') docs.push({ name: d.name, hash: d.name.split('/').pop(), title: str(d.fields, 'title'), src: str(d.fields, 'src'),
            bytes: d.fields && d.fields.bytes && d.fields.bytes.integerValue != null ? String(d.fields.bytes.integerValue) : '' });
        });
        if (r.json.nextPageToken && ++page < MAX_PAGES) return next(r.json.nextPageToken);
        return { ok: true, docs: docs };
      });
    }
    return next('');
  }
  function commitAll(writes) {
    var i = 0, url = HOST + '/v1/' + base() + ':commit';
    function step() {
      if (i >= writes.length) return Promise.resolve({ ok: true });
      var part = writes.slice(i, i + CHUNK); i += CHUNK;
      return request('POST', url, { writes: part }).then(function (r) { return r.ok ? step() : r; });
    }
    return step();
  }
  function clean(s) {   // SOMBER: hanya judul, sumber (nama folder), ukuran. id/URI/path TIDAK ikut.
    if (!s || typeof s.title !== 'string') return null;
    var title = s.title.slice(0, 200), src = (typeof s.src === 'string' ? s.src : '').slice(0, 80);
    if (!title) return null;
    return { title: title, src: src, bytes: Math.max(0, Math.floor(+s.size || 0)), h: hash(src + '|' + title) };
  }

  // ---------------------------------------------------------------- API
  // Cermin daftar saat ini ke Firestore: tulis yang baru/berubah, hapus yang sudah tidak ada di HP.
  function backup(songs) {
    return run(function () {
      var dev = deviceId(), want = {}, n = 0, now = new Date().toISOString();
      (Array.isArray(songs) ? songs : []).slice(0, MAX_SONGS).forEach(function (s) { var c = clean(s); if (c && !want[c.h]) { want[c.h] = c; n++; } });
      return listAll(dev).then(function (r) {
        if (!r.ok) return r;
        var have = {}, writes = [], deleted = 0;
        r.docs.forEach(function (d) { have[d.hash] = d; });
        Object.keys(want).forEach(function (h) {
          var c = want[h], d = have[h];
          if (d && d.title === c.title && d.src === c.src && d.bytes === String(c.bytes)) return;   // tidak berubah
          writes.push({ update: { name: docName(dev, h), fields: { title: { stringValue: c.title }, src: { stringValue: c.src }, bytes: { integerValue: String(c.bytes) }, updatedAt: { timestampValue: now } } } });
        });
        var written = writes.length;
        r.docs.forEach(function (d) { if (!want[d.hash]) { writes.push({ delete: d.name }); deleted++; } });
        return commitAll(writes).then(function (c) { return c.ok ? { ok: true, total: n, written: written, deleted: deleted } : c; });
      });
    });
  }
  function list() {
    return run(function () {
      return listAll(deviceId()).then(function (r) {
        if (!r.ok) return r;
        var items = r.docs.map(function (d) { return { title: d.title, src: d.src, bytes: +d.bytes || 0 }; });
        items.sort(function (a, b) { return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : a.title.toLowerCase() > b.title.toLowerCase() ? 1 : 0; });
        return { ok: true, items: items };
      });
    });
  }
  function wipe() {
    return run(function () {
      return listAll(deviceId()).then(function (r) {
        if (!r.ok) return r;
        return commitAll(r.docs.map(function (d) { return { delete: d.name }; })).then(function (c) { return c.ok ? { ok: true, deleted: r.docs.length } : c; });
      });
    });
  }

  root.GWCLOUD = { isEnabled: isEnabled, setEnabled: setEnabled, deviceId: deviceId, backup: backup, list: list, wipe: wipe, message: message, _cfg: C, _hash: hash };
})(typeof window !== 'undefined' ? window : globalThis);
