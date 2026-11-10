// Uji PEMUTAR LAGU OFFLINE (v1.7.0): www/player/songplayer.js dijalankan di DOM tiruan dengan jembatan native tiruan,
// ditambah pemeriksaan statis atas index.html, sw.js, workflow, manifest, dan berkas Java.
// Jalankan: node tools/songs-test.js   (Node >= 18, tanpa dependensi; butuh python3 hanya untuk uji insert_activity.py)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..'), rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('GAGAL:', m); } else console.log('ok   :', m); };

const JS = rd('www/player/songplayer.js'), HTML = rd('www/index.html'), SW = rd('www/sw.js');
const BR = rd('native-patches/SongPlayerBridge.java'), PK = rd('native-patches/SongPickerActivity.java'), SVC = rd('native-patches/HtmlKeyboardService.java');

// ---------------------------------------------------------------- statis
const NET = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'https://', 'http://', 'Authorization', 'importScripts'];
ok(NET.every(t => !JS.includes(t)), 'songplayer.js bebas kode jaringan (' + NET.filter(t => JS.includes(t)).join(',') + ')');
ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(JS), 'songplayer.js tidak memakai innerHTML/eval (nama berkas tidak dipercaya)');
const NETJ = ['java.net.', 'HttpURLConnection', 'okhttp', 'android.permission.INTERNET', 'URLConnection', 'Socket'];
ok(NETJ.every(t => !BR.includes(t) && !PK.includes(t)), 'berkas Java pemutar bebas kode jaringan');
ok(!/READ_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/.test(BR + PK + rd('native-patches/insert_activity.py')), 'tidak meminta izin penyimpanan luas (pakai folder aplikasi + Storage Access Framework)');
ok(/addJavascriptInterface\(songs, "AndroidSongs"\)/.test(SVC) && /songs\.release\(\)/.test(SVC), 'HtmlKeyboardService mendaftarkan window.AndroidSongs dan melepasnya di onDestroy');
ok(!/FLAG_ACTIVITY_NO_HISTORY\)\s*;/.test(BR.replace(/\/\/.*$/gm, '')), 'pemilih tidak diluncurkan dengan NO_HISTORY (hasil pemilih akan hilang)');
ok(/FLAG_GRANT_PERSISTABLE_URI_PERMISSION/.test(PK) && /takePersistableUriPermission/.test(PK), 'pilih folder: izin baca disimpan tetap');
ok(/resolveFile/.test(BR) && /getCanonicalFile/.test(BR) && /startsWith\(t \+ "\/document\/"\)/.test(BR), 'id lagu divalidasi (anti path traversal; URI harus di bawah folder yang dipilih pengguna)');
ok(/removeSong[\s\S]*resolveFile\(id\)/.test(BR) && !/forgetFolder[\s\S]{0,400}\.delete\(\)/.test(BR), 'hapus hanya di folder aplikasi; "lupakan folder" tidak menghapus berkas');
ok(/id="songsBtn"/.test(HTML) && /player\/songplayer\.js/.test(HTML) && /window\.gwMicHold\s*=/.test(HTML), 'index.html: tombol Lagu offline, pemuat lazy, dan gwMicHold ada');
ok(/onKeyboardShown\s*=\s*function\(\)\{[^}]*!_songHoldsMic/.test(HTML) && /_kbVisible && !_songHoldsMic\) startMic/.test(HTML), 'mic tidak hidup sendiri (keyboard muncul / retry) selama lagu berbunyi');
ok(!/<script[^>]*player\/songplayer/.test(HTML), 'modul lagu tidak dimuat otomatis (hanya saat tombol diketuk)');
ok(SW.includes("'player/songplayer.js'") && SW.includes("'player/cloud.js'") && /cache-v(\d+)/.test(SW) && +SW.match(/cache-v(\d+)/)[1] >= 33, 'sw.js menyimpan songplayer.js + cloud.js dan versi cache dinaikkan');
for (const wf of ['.github/workflows/android-build.yml', 'workflows/android-build.yml']) { const y = rd(wf);
  ok(y.includes('SongPlayerBridge.java') && y.includes('SongPickerActivity.java') && y.includes('insert_activity.py'), wf + ': menempel 2 berkas Java + mendaftarkan activity'); }
ok(rd('.github/workflows/android-build.yml') === rd('workflows/android-build.yml'), 'dua salinan workflow identik');
{ const v = JSON.parse(rd('package.json')).version.split('.').map(Number); ok(v[0] > 1 || (v[0] === 1 && v[1] >= 7), 'package.json versi >= 1.7.0'); }

// insert_activity.py: sekali, idempotent, taskAffinity kosong
try {
  const t = path.join(os.tmpdir(), 'gw-manifest-' + process.pid + '.xml'); fs.writeFileSync(t, '<manifest>\n<application>\n<activity android:name=".MainActivity"/>\n</application>\n</manifest>\n');
  const run = () => cp.execFileSync('python3', [path.join(ROOT, 'native-patches/insert_activity.py'), t]).toString();
  const o1 = run(), o2 = run(), x = fs.readFileSync(t, 'utf8'); fs.unlinkSync(t);
  ok((x.match(/SongPickerActivity/g) || []).length === 1 && /taskAffinity=""/.test(x) && /exported="false"/.test(x) && /Translucent/.test(x) && /berhasil/.test(o1) && /lewati/.test(o2), 'insert_activity.py: menambah activity sekali, taskAffinity kosong, exported=false, idempotent');
} catch (e) { ok(false, 'insert_activity.py gagal dijalankan: ' + e.message); }

// ---------------------------------------------------------------- DOM + jembatan tiruan
class El { constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this._text = ''; this.handlers = {}; this.attrs = {}; this.className = ''; this.value = ''; this.checked = false; this.disabled = false; }
  set textContent(v) { this._text = String(v); this.children = this.children.filter(() => false); } get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; } removeChild(c) { this.children = this.children.filter(x => x !== c); return c; } get firstChild() { return this.children[0] || null; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); } fire(t) { (this.handlers[t] || []).forEach(f => f({})); } click() { this.fire('click'); } }
const byId = {}; const head = new El('head'), body = new El('body');
global.window = global; global.localStorage = (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; })();
global.document = { head, body, createElement: t => new El(t), getElementById: id => byId[id] || null };
let netCalls = 0; global.fetch = () => { netCalls++; throw new Error('JARINGAN'); };
const calls = []; let holds = []; let listReq = 0; let lastList = null;
const bridge = { listAsync: id => { listReq = id; calls.push(['list', id]); return ''; }, play: id => calls.push(['play', id]), pause: () => calls.push(['pause']), resume: () => calls.push(['resume']),
  stop: () => calls.push(['stop']), seek: ms => calls.push(['seek', ms]), setVolume: v => calls.push(['vol', v]), addSongs: () => calls.push(['addSongs']), addFolder: () => calls.push(['addFolder']),
  removeSong: id => calls.push(['remove', id]), forgetFolder: id => calls.push(['forget', id]), state: () => '{"id":"","state":"idle","pos":0,"dur":0}' };
global.gwMicHold = on => holds.push(!!on);
global.AndroidSongs = bridge;
(0, eval)(JS);
const S = window.GWSONGS;
const walk = (e, f) => { f(e); e.children.forEach(c => walk(c, f)); };
const buttons = label => { const r = []; walk(byId.__panel || panelRoot(), e => { if (e.tag === 'button' && e.textContent === label) r.push(e); }); return r; };
function panelRoot() { let p = null; walk(body, e => { if (e.id === 'gwSongPanel') p = e; }); return p; }
const last = n => calls.filter(c => c[0] === n).pop();
const state = o => window.onSongState(JSON.stringify(Object.assign({ id: '', state: 'idle', pos: 0, dur: 0, err: '' }, o)));
const feed = (songs, folders, extra) => { window.__gwSongsResult(listReq, JSON.stringify(Object.assign({ ok: true, dir: '/sdcard/Android/data/x/files/songs', truncated: false, songs, folders: folders || [] }, extra))); };

// ---------------------------------------------------------------- logika murni
ok(S.fmtTime(0) === '0:00' && S.fmtTime(65000) === '1:05' && S.fmtTime(3600000 + 61000) === '1:01:01' && S.fmtTime(-5) === '0:00' && S.fmtTime(NaN) === '0:00', 'fmtTime');
const L = [{ title: 'Hujan di Bulan Juni' }, { title: 'Sunda Mah' }, { title: 'Blues Malam' }];
ok(S.filterSongs(L, 'BLUES').length === 1 && S.filterSongs(L, '  ').length === 3 && S.filterSongs(L, 'zzz').length === 0, 'filterSongs: tidak peka huruf besar, kosong = semua');
ok(S.nextIndex(3, 0, 1, false, 'off', true) === 1 && S.nextIndex(3, 2, 1, false, 'off', true) === -1, 'berikutnya otomatis: maju, habis di akhir (ulang mati)');
ok(S.nextIndex(3, 2, 1, false, 'all', true) === 0 && S.nextIndex(3, 1, 1, false, 'one', true) === 1, 'ulang semua = kembali ke awal; ulang satu = lagu sama');
ok(S.nextIndex(3, 2, 1, false, 'off', false) === 0 && S.nextIndex(3, 0, -1, false, 'off', false) === 2, 'tombol berikutnya/sebelumnya (manual) membungkus');
ok(S.nextIndex(3, -1, 1, false, 'off', false) === 0 && S.nextIndex(3, -1, -1, false, 'off', false) === 2 && S.nextIndex(0, -1, 1, false, 'off', false) === -1, 'tanpa lagu aktif: mulai dari ujung yang benar; antrean kosong = -1');
let allDiff = true; for (let i = 0; i < 200; i++) if (S.nextIndex(5, 2, 1, true, 'off', true) === 2) allDiff = false;
ok(allDiff && S.nextIndex(5, 2, 1, true, 'off', true, () => 0.99) === 4, 'acak: tidak pernah lagu yang sama; rnd bisa disuntik');
ok(S.cleanSong({ id: 'f:a.mp3', title: 'a' }) && !S.cleanSong({ id: 'x:evil' }) && !S.cleanSong(null) && !S.cleanSong({ id: 5 }), 'cleanSong menolak id di luar f:/u:');
ok(S.errText('unsupported-or-unreadable').includes('tidak didukung') && S.errText('play-error-1/-1004').includes('kode') && S.errText('aneh').includes('aneh'), 'errText ramah untuk kode galat');

(async () => {
  // ---------------------------------------------------------------- panel
  window.gwSongsOpen();
  const P = panelRoot();
  ok(!!P && P.style.display === 'block' && calls.some(c => c[0] === 'list'), 'panel terbuka dan meminta daftar lagu dari native');
  ok(P.textContent.includes('OFFLINE') && P.textContent.includes('＋ Tambah lagu') && P.textContent.includes('📁 Pilih folder'), 'panel punya tanda OFFLINE, Tambah lagu, Pilih folder');
  window.__gwSongsResult(listReq - 1, JSON.stringify({ ok: true, songs: [{ id: 'f:basi.mp3', title: 'BASI' }], folders: [] }));
  ok(!P.textContent.includes('BASI'), 'jawaban daftar yang basi (reqId lama) diabaikan');
  const evil = '<img src=x onerror=alert(1)>';
  feed([{ id: 'f:satu.mp3', title: 'Satu', src: 'app', size: 3145728 }, { id: 'f:' + evil + '.mp3', title: evil, src: 'app', size: 2048 }, { id: 'u:content://docs/tree/1%3AMusic/document/1%3AMusic%2Ftiga.flac', title: 'Tiga', src: 'Music', size: 900 }, { id: 'zzz:bad', title: 'Jahat' }],
    [{ id: 'content://docs/tree/1%3AMusic', name: 'Music', ok: true }]);
  const rows = []; walk(P, e => { if (e.attrs && e.attrs['data-id']) rows.push(e); });
  ok(rows.length === 3, 'tiga lagu valid ditampilkan, id tak dikenal dibuang (' + rows.length + ')');
  ok(P.textContent.includes(evil) && !P.children.some(c => c.tag === 'img'), 'judul berbahaya tampil sebagai TEKS biasa (textContent), bukan elemen');
  ok(P.textContent.includes('3.0 MB') && P.textContent.includes('folder aplikasi') && P.textContent.includes('📁 Music'), 'ukuran, sumber, dan daftar folder tampil');
  const dels = []; walk(P, e => { if (e.tag === 'button' && e.className.includes('del')) dels.push(e); });
  ok(dels.length === 2, 'tombol hapus hanya untuk lagu folder aplikasi (2 dari 3)');

  // putar
  holds = []; calls.length = 0;
  rows[0].children[0].click();
  ok(last('play') && last('play')[1] === 'f:satu.mp3' && holds.includes(true), 'ketuk lagu -> native.play(id) + mikrofon gitar ditahan');
  state({ id: 'f:satu.mp3', state: 'playing', pos: 1000, dur: 180000 });
  ok(buttons('⏸').length === 1 && P.textContent.includes('0:01 / 3:00') && P.textContent.includes('Satu'), 'status playing: tombol jadi ⏸, waktu dan judul tampil');
  holds = []; state({ id: 'f:satu.mp3', state: 'paused', pos: 2000, dur: 180000 });
  ok(holds[holds.length - 1] === false && buttons('▶').length === 1, 'jeda -> mikrofon gitar boleh hidup lagi, tombol kembali ▶');
  calls.length = 0; buttons('▶')[0].click(); ok(last('resume') && holds.pop() === true, '▶ saat jeda -> resume + tahan mikrofon');
  state({ id: 'f:satu.mp3', state: 'playing', pos: 3000, dur: 180000 }); calls.length = 0; buttons('⏸')[0].click(); ok(!!last('pause'), '⏸ -> native.pause()');

  // selesai -> otomatis lagu berikutnya (antrean = daftar tampil)
  calls.length = 0; state({ id: 'f:satu.mp3', state: 'ended', pos: 0, dur: 180000 });
  ok(last('play') && last('play')[1].startsWith('f:<img'), 'lagu selesai -> lagu berikutnya diputar otomatis');
  calls.length = 0; state({ id: 'f:' + evil + '.mp3', state: 'ended' }); ok(last('play') && last('play')[1].startsWith('u:content://'), 'lanjut ke lagu ketiga (folder pilihan)');
  holds = []; calls.length = 0; state({ id: 'u:content://docs/tree/1%3AMusic/document/1%3AMusic%2Ftiga.flac', state: 'ended' });
  ok(!last('play') && !!last('stop') && holds[holds.length - 1] === false, 'antrean habis (ulang mati) -> berhenti, mikrofon gitar hidup lagi');
  state({ id: '', state: 'idle' });

  // ulang
  buttons('🔁 Ulang: mati')[0].click(); buttons('🔁 Ulang: semua')[0].click();
  ok(buttons('🔁 Ulang: satu').length === 1, 'tombol ulang berputar mati -> semua -> satu');
  rows[0].children[0].click(); calls.length = 0; state({ id: 'f:satu.mp3', state: 'ended' });
  ok(last('play') && last('play')[1] === 'f:satu.mp3', 'ulang satu: lagu yang sama diputar lagi');
  buttons('🔁 Ulang: satu')[0].click();   // -> mati
  buttons('🔀 Acak: tidak')[0].click(); calls.length = 0; rows[0].children[0].click(); calls.length = 0; state({ id: 'f:satu.mp3', state: 'ended' });
  ok(last('play') && last('play')[1] !== 'f:satu.mp3', 'acak: lagu berikutnya bukan lagu yang baru selesai');
  buttons('🔀 Acak: ya')[0].click();

  // galat
  holds = []; state({ id: 'f:satu.mp3', state: 'error', err: 'unsupported-or-unreadable' });
  ok(P.textContent.includes('tidak didukung') && holds[holds.length - 1] === false, 'galat format -> pesan jelas + mikrofon gitar dilepas');

  // pencarian & hapus 2 ketukan & lupakan folder
  const find = []; walk(P, e => { if (e.tag === 'input' && e.placeholder === 'Cari lagu…') find.push(e); });
  find[0].value = 'tiga'; find[0].fire('input'); let n = 0; walk(P, e => { if (e.attrs && e.attrs['data-id']) n++; }); ok(n === 1 && P.textContent.includes('1 cocok'), 'pencarian menyaring daftar');
  find[0].value = ''; find[0].fire('input');
  const d0 = []; walk(P, e => { if (e.tag === 'button' && e.className.includes('del')) d0.push(e); });
  calls.length = 0; d0[0].click(); ok(!last('remove') && d0[0].textContent === 'Hapus?', 'hapus: ketukan pertama hanya meminta konfirmasi');
  d0[0].click(); ok(last('remove') && last('remove')[1] === 'f:satu.mp3', 'hapus: ketukan kedua memanggil native.removeSong(id)');
  const fg = buttons('Lupakan')[0]; calls.length = 0; fg.click(); ok(!last('forget'), 'lupakan folder: perlu dua ketukan'); fg.click(); ok(last('forget') && last('forget')[1] === 'content://docs/tree/1%3AMusic', 'lupakan folder memanggil forgetFolder(treeUri)');

  // tambah / pilih folder / perubahan dari native
  calls.length = 0; buttons('＋ Tambah lagu')[0].click(); buttons('📁 Pilih folder')[0].click(); ok(!!last('addSongs') && !!last('addFolder'), 'tombol Tambah lagu / Pilih folder membuka pemilih native');
  calls.length = 0; window.onSongsChanged('{"added":3,"failed":1}');
  ok(P.textContent.includes('3 lagu ditambahkan') && P.textContent.includes('1 dilewati') && !!last('list'), 'selesai menambah: ringkasan tampil dan daftar dimuat ulang otomatis');
  window.onSongsChanged('{"error":"no-picker"}'); ok(P.textContent.includes('tidak punya pemilih'), 'galat pemilih ditampilkan');

  // pengaturan: mikrofon
  const cb = []; walk(P, e => { if (e.tag === 'input' && e.type === 'checkbox') cb.push(e); });
  holds = []; cb[0].checked = false; cb[0].fire('change'); state({ id: 'f:satu.mp3', state: 'playing', pos: 1, dur: 1000 });
  ok(!holds.includes(true), 'opsi "matikan mikrofon" dimatikan -> mikrofon gitar tidak ditahan');
  cb[0].checked = true; cb[0].fire('change');
  calls.length = 0; cb[1].checked = true; cb[1].fire('change'); state({ id: 'f:satu.mp3', state: 'playing', pos: 1, dur: 1000 }); window.gwSongsOnHidden();
  ok(!!last('stop'), 'opsi "hentikan saat keyboard ditutup" -> native.stop() saat keyboard disembunyikan');
  cb[1].checked = false; cb[1].fire('change'); calls.length = 0; window.gwSongsOnHidden(); ok(!last('stop'), 'tanpa opsi itu, lagu terus main saat keyboard ditutup');
  ok(JSON.parse(localStorage.getItem('gw_songs_prefs_v1')).holdMic === true, 'pengaturan tersimpan di localStorage');

  // cadangan cloud (GWCLOUD palsu: logika sungguhan diuji di tools/cloud-test.js)
  const tk = () => new Promise(r => setTimeout(r, 15)); let cloudOn = false; const cc = [];
  global.GWCLOUD = { isEnabled: () => cloudOn, setEnabled: b => { cloudOn = !!b; return cloudOn; }, deviceId: () => 'abcdefghijklmnopqrst', message: c => 'PESAN:' + c,
    backup: async sg => { cc.push(['backup', sg.length]); return cloudOn ? { ok: true, total: sg.length, written: 2, deleted: 1 } : { ok: false, error: 'disabled' }; },
    list: async () => { cc.push(['list']); return { ok: true, items: [{ title: 'Satu' }, { title: 'Lagu Hilang' }] }; }, wipe: async () => { cc.push(['wipe']); return { ok: true, deleted: 2 }; } };
  ok(P.textContent.includes('Cadangan daftar lagu') && P.textContent.includes('MATI') && P.textContent.includes('Memutar lagu tetap 100% offline'), 'bagian cadangan ada, bawaan MATI, menjelaskan apa yang dikirim');
  buttons('Cadangkan sekarang')[0].click(); await tk(); ok(P.textContent.includes('PESAN:disabled') && cc.length === 1, 'cadangkan saat mati -> ditolak oleh modul, pesan tampil');
  cc.length = 0; buttons('Nyalakan cadangan')[0].click(); await tk(); ok(!cloudOn && buttons('Yakin? Judul lagu akan dikirim ke Google').length === 1, 'menyalakan: ketukan pertama hanya minta konfirmasi');
  buttons('Yakin? Judul lagu akan dikirim ke Google')[0].click(); await tk(); ok(cloudOn && P.textContent.includes('NYALA') && buttons('Matikan cadangan').length === 1, 'ketukan kedua menyalakan');
  buttons('Cadangkan sekarang')[0].click(); await tk(); ok(P.textContent.includes('✓ Tercadang: 3 lagu') && cc[0][0] === 'backup', 'cadangkan: daftar lagu diserahkan, ringkasan tampil');
  buttons('Lihat cadangan')[0].click(); await tk(); ok(P.textContent.includes('✓ Satu') && P.textContent.includes('— Lagu Hilang') && P.textContent.includes('audionya tidak ikut'), 'lihat cadangan: menandai yang ada / tidak ada di HP ini');
  const wp = buttons('Hapus cadangan saya')[0]; cc.length = 0; wp.click(); await tk(); ok(!cc.length, 'hapus cadangan: ketukan pertama tidak menghapus'); wp.click(); await tk(); ok(cc[0] && cc[0][0] === 'wipe' && P.textContent.includes('2 entri cadangan dihapus'), 'hapus cadangan: ketukan kedua menghapus');
  buttons('Matikan cadangan')[0].click(); await tk(); ok(!cloudOn && P.textContent.includes('Cadangan dimatikan'), 'mematikan cadangan cukup satu ketukan');
  delete global.GWCLOUD;

  // tanpa jembatan native (APK lama / peramban)
  window.gwSongsClose(); ok(P.style.display === 'none', 'Tutup menyembunyikan panel');
  delete global.AndroidSongs; window.gwSongsOpen(); ok(P.textContent.includes('APK Guitarwiter terbaru'), 'tanpa AndroidSongs: pesan jujur (butuh APK terbaru), tidak error');
  ok(netCalls === 0, 'tidak ada satu pun permintaan jaringan selama semua uji');

  console.log(fail ? '\n' + fail + ' GAGAL' : '\nSEMUA LULUS');
  process.exit(fail ? 1 : 0);
})();
