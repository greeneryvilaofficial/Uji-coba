/* ============================================================================================
 * [LABEL SONGS / PANEL] www/player/songplayer.js  (v1.7.0)
 * Pemutar lagu OFFLINE di keyboard. Memutar berkas audio dari folder aplikasi atau folder lokal yang dipilih pengguna.
 * TIDAK ada kode jaringan di berkas ini (diperiksa tools/songs-test.js). Semua suara diputar oleh native
 * (window.AndroidSongs = SongPlayerBridge.java); berkas ini hanya tampilan + antrean.
 * Warna 100% dari variabel CSS keyboard (ikut tema). Teks lagu SELALU lewat textContent (nama berkas tidak dipercaya).
 *   window.gwSongsOpen() / window.gwSongsClose()
 *   window.onSongState(json) / window.onSongsChanged(json) / window.__gwSongsResult(reqId, json)  <- dipanggil native
 *   window.gwMicHold(bool)  <- disediakan index.html: matikan mikrofon gitar selama lagu berbunyi (speaker -> mic = huruf hantu)
 * ============================================================================================ */
(function (root) {
  'use strict';
  if (root.gwSongsOpen) return;
  var doc = root.document;
  var PREF_KEY = 'gw_songs_prefs_v1';
  var MAX_ROWS = 200;
  var prefs = { shuffle: false, repeat: 'off', holdMic: true, stopOnHide: false, volume: 100, last: '' };

  // ---------------------------------------------------------------- logika murni (diuji di tools/songs-test.js)
  function fmtTime(ms) {
    ms = Math.max(0, Math.floor((+ms || 0) / 1000));
    var h = Math.floor(ms / 3600), m = Math.floor((ms % 3600) / 60), s = ms % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') + m : m) + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtSize(b) { b = +b || 0; return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function filterSongs(list, q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return list.slice();
    return list.filter(function (s) { return s.title.toLowerCase().indexOf(q) >= 0; });
  }
  // n = panjang antrean, cur = indeks sekarang (-1 = tidak ada), dir = +1/-1, auto = true bila lagu selesai sendiri.
  // Mengembalikan indeks berikutnya, atau -1 bila antrean habis.
  function nextIndex(n, cur, dir, shuffle, repeat, auto, rnd) {
    if (n <= 0) return -1;
    if (auto && repeat === 'one' && cur >= 0 && cur < n) return cur;
    if (shuffle && n > 1) { var r, f = rnd || Math.random, guard = 0; do { r = Math.floor(f() * n); } while (r === cur && ++guard < 50); return r === cur ? (cur + 1) % n : r; }
    if (cur < 0 || cur >= n) return dir < 0 ? n - 1 : 0;
    var x = cur + dir;
    if (x >= 0 && x < n) return x;
    return (repeat === 'all' || !auto) ? (x < 0 ? n - 1 : 0) : -1;
  }
  function parseJSON(x) { try { var o = typeof x === 'string' ? JSON.parse(x) : x; return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }
  function cleanSong(s) {
    if (!s || typeof s.id !== 'string' || (s.id.indexOf('f:') !== 0 && s.id.indexOf('u:') !== 0)) return null;
    return { id: s.id, title: String(s.title == null ? '' : s.title).slice(0, 200) || '(tanpa judul)', src: String(s.src || ''), size: +s.size || 0 };
  }
  var ERR = {
    'bad-id': 'Lagu tidak dikenali.', 'file-missing': 'Berkasnya sudah tidak ada. Muat ulang daftar.', 'focus-denied': 'Aplikasi lain sedang memakai audio (mis. panggilan).',
    'open-failed': 'Berkas tidak bisa dibuka.', 'start-failed': 'Gagal memulai pemutaran.', 'unsupported-or-unreadable': 'Format ini tidak didukung HP, atau berkasnya rusak.',
    'picker-failed': 'Pemilih berkas tidak bisa dibuka.', 'no-picker': 'HP ini tidak punya pemilih berkas.', 'permission': 'Izin folder ditolak.'
  };
  function errText(e) { return ERR[e] || (e && e.indexOf('play-error') === 0 ? 'Gagal memutar (kode ' + e.slice(11) + '). Mungkin formatnya tidak didukung.' : 'Gagal: ' + e); }
  root.GWSONGS = { fmtTime: fmtTime, fmtSize: fmtSize, filterSongs: filterSongs, nextIndex: nextIndex, cleanSong: cleanSong, errText: errText };

  // ---------------------------------------------------------------- keadaan
  var panel = null, songs = [], folders = [], queue = [], dirPath = '', truncated = false;
  var st = { id: '', state: 'idle', pos: 0, dur: 0, err: '' };
  var reqSeq = 0, loaded = false, seeking = false, armed = {}, query = '', notice = '';
  var elNow, elTime, elSeek, elPlay, elStatus, elList, elFold, elVol, elShuf, elRep, elFind, elHold, elHide;

  function B() { return root.AndroidSongs || null; }
  function $(id) { return doc.getElementById(id); }
  function loadPrefs() {
    try { var o = JSON.parse(root.localStorage.getItem(PREF_KEY) || 'null'); if (o && typeof o === 'object') {
      prefs.shuffle = !!o.shuffle; prefs.repeat = (o.repeat === 'all' || o.repeat === 'one') ? o.repeat : 'off';
      prefs.holdMic = o.holdMic !== false; prefs.stopOnHide = !!o.stopOnHide;
      prefs.volume = Math.max(0, Math.min(100, +o.volume >= 0 ? +o.volume : 100)); prefs.last = typeof o.last === 'string' ? o.last : '';
    } } catch (e) { }
  }
  function savePrefs() { try { root.localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { } }
  function holdMic(on) { try { if (root.gwMicHold) root.gwMicHold(!!on && prefs.holdMic); } catch (e) { } }
  function setStatus(t) { if (elStatus) elStatus.textContent = t; }
  function titleOf(id) { for (var i = 0; i < songs.length; i++) if (songs[i].id === id) return songs[i].title; return ''; }

  // ---------------------------------------------------------------- daftar dari native
  function refresh(keepNotice) {
    var b = B();
    if (!b) { setStatus('Fitur ini butuh APK Guitarwiter terbaru: jembatan native AndroidSongs tidak ditemukan. Pasang ulang APK dari build terbaru.'); return; }
    var id = ++reqSeq; if (!keepNotice) { notice = ''; setStatus('Memuat daftar lagu…'); }
    try { b.listAsync(id); } catch (e) { setStatus('Gagal memuat daftar: ' + e); }
  }
  root.__gwSongsResult = function (reqId, json) {
    if (reqId !== reqSeq) return;   // jawaban basi
    var o = parseJSON(json);
    if (!o || !o.ok) { setStatus('Gagal memuat daftar lagu' + (o && o.error ? ' (' + o.error + ')' : '') + '.'); return; }
    songs = (Array.isArray(o.songs) ? o.songs : []).map(cleanSong).filter(Boolean);
    folders = (Array.isArray(o.folders) ? o.folders : []).filter(function (f) { return f && typeof f.id === 'string'; })
      .map(function (f) { return { id: f.id, name: String(f.name || '').slice(0, 80), ok: f.ok !== false }; });
    dirPath = String(o.dir || ''); truncated = !!o.truncated; loaded = true;
    render(); renderFolders(); renderNow();
  };
  root.onSongsChanged = function (json) {
    var o = parseJSON(json) || {};
    // Pesan ini harus BERTAHAN setelah daftar dimuat ulang (render() menempelkannya di atas jumlah lagu).
    if (o.error) notice = '✗ ' + errText(o.error);
    else if (typeof o.removed === 'number') notice = o.removed ? 'Lagu dihapus dari folder aplikasi.' : 'Gagal menghapus lagu.';
    else if (o.folder) notice = 'Folder diperbarui.';
    else notice = (o.added || 0) + ' lagu ditambahkan' + (o.failed ? ', ' + o.failed + ' dilewati (bukan audio / ruang penuh / gagal)' : '') + '.';
    setStatus(notice);
    if (panel) refresh(true);
  };

  // ---------------------------------------------------------------- pemutaran
  function playIndex(i) {
    if (i < 0 || i >= queue.length) return;
    playId(queue[i].id);
  }
  function playId(id) {
    var b = B(); if (!b) { refresh(); return; }
    st = { id: id, state: 'loading', pos: 0, dur: 0, err: '' };
    prefs.last = id; savePrefs();
    holdMic(true); renderNow(); markCurrent();
    try { b.setVolume(prefs.volume); b.play(id); } catch (e) { st.state = 'error'; st.err = 'open-failed'; holdMic(false); renderNow(); }
  }
  function curIndex() { for (var i = 0; i < queue.length; i++) if (queue[i].id === st.id) return i; return -1; }
  function step(dir, auto) {
    if (!queue.length) queue = filterSongs(songs, query);
    var i = nextIndex(queue.length, curIndex(), dir, prefs.shuffle, prefs.repeat, !!auto);
    if (i < 0) { try { if (B()) B().stop(); } catch (e) { } holdMic(false); return false; }
    playIndex(i); return true;
  }
  function togglePlay() {
    var b = B(); if (!b) { refresh(); return; }
    if (st.state === 'playing' || st.state === 'loading') { try { b.pause(); } catch (e) { } return; }
    if (st.state === 'paused' && st.id) { holdMic(true); try { b.resume(); } catch (e) { } return; }
    queue = filterSongs(songs, query);
    var start = prefs.last && queue.some(function (s) { return s.id === prefs.last; }) ? prefs.last : (queue[0] && queue[0].id);
    if (start) playId(start); else setStatus('Belum ada lagu. Ketuk "＋ Tambah lagu" atau "📁 Pilih folder".');
  }
  root.onSongState = function (json) {
    var s = parseJSON(json); if (!s) return;
    st = { id: String(s.id || ''), state: String(s.state || 'idle'), pos: +s.pos || 0, dur: +s.dur || 0, err: String(s.err || '') };
    if (st.state === 'ended') { if (!step(+1, true)) { st.state = 'idle'; st.pos = 0; renderNow(); markCurrent(); } return; }
    holdMic(st.state === 'playing' || st.state === 'loading');   // jeda / berhenti / galat -> mikrofon gitar hidup lagi
    if (st.state === 'error') setStatus('✗ ' + errText(st.err));
    renderNow(); markCurrent();
  };
  // Dipanggil index.html saat keyboard ditutup.
  root.gwSongsOnHidden = function () { if (prefs.stopOnHide && B() && (st.state === 'playing' || st.state === 'loading' || st.state === 'paused')) { try { B().stop(); } catch (e) { } } };

  // ---------------------------------------------------------------- tampilan
  function renderNow() {
    if (!panel) return;
    var playing = st.state === 'playing' || st.state === 'loading';
    elNow.textContent = st.id ? (titleOf(st.id) || '(lagu)') : 'Belum ada lagu diputar';
    elTime.textContent = st.state === 'loading' ? 'Memuat…' : fmtTime(st.pos) + ' / ' + fmtTime(st.dur);
    elPlay.textContent = playing ? '⏸' : '▶';
    elPlay.setAttribute('aria-label', playing ? 'Jeda' : 'Putar');
    elSeek.max = String(Math.max(1, st.dur)); if (!seeking) elSeek.value = String(Math.min(st.pos, Math.max(1, st.dur)));
    elSeek.disabled = !(st.state === 'playing' || st.state === 'paused');
    elShuf.className = prefs.shuffle ? 'on' : ''; elShuf.textContent = '🔀 Acak: ' + (prefs.shuffle ? 'ya' : 'tidak');
    elRep.className = prefs.repeat !== 'off' ? 'on' : ''; elRep.textContent = '🔁 Ulang: ' + (prefs.repeat === 'all' ? 'semua' : prefs.repeat === 'one' ? 'satu' : 'mati');
  }
  function markCurrent() {
    if (!elList) return;
    var rows = elList.children;
    for (var i = 0; i < rows.length; i++) { var r = rows[i]; if (r.getAttribute && r.getAttribute('data-id') != null) r.className = 'row' + (r.getAttribute('data-id') === st.id ? ' cur' : ''); }
  }
  function twoTap(key, btn, label, armedLabel, fn) {
    btn.addEventListener('click', function () {
      if (!armed[key]) { armed[key] = true; btn.textContent = armedLabel; setTimeout(function () { armed[key] = false; btn.textContent = label; }, 3000); return; }
      armed[key] = false; btn.textContent = label; fn();
    });
  }
  function render() {
    if (!panel) return;
    while (elList.firstChild) elList.removeChild(elList.firstChild);
    var shown = filterSongs(songs, query);
    var n = Math.min(shown.length, MAX_ROWS);
    for (var i = 0; i < n; i++) (function (s) {
      var row = doc.createElement('div'); row.className = 'row' + (s.id === st.id ? ' cur' : ''); row.setAttribute('data-id', s.id);
      var b = doc.createElement('button'); b.className = 'song';
      var t = doc.createElement('span'); t.className = 'ttl'; t.textContent = s.title; b.appendChild(t);
      var m = doc.createElement('span'); m.className = 'sub'; m.textContent = (s.src === 'app' ? 'folder aplikasi' : s.src) + ' · ' + fmtSize(s.size); b.appendChild(m);
      b.addEventListener('click', function () { queue = filterSongs(songs, query); playId(s.id); });
      row.appendChild(b);
      if (s.id.indexOf('f:') === 0) { var d = doc.createElement('button'); d.className = 'fn del'; d.textContent = '🗑'; d.setAttribute('aria-label', 'Hapus ' + s.title);
        twoTap('del:' + s.id, d, '🗑', 'Hapus?', function () { try { if (B()) B().removeSong(s.id); } catch (e) { } }); row.appendChild(d); }
      elList.appendChild(row);
    })(shown[i]);
    var info = songs.length + ' lagu' + (shown.length !== songs.length ? ' · ' + shown.length + ' cocok' : '') + (shown.length > MAX_ROWS ? ' · menampilkan ' + MAX_ROWS + ' pertama, persempit dengan pencarian' : '') + (truncated ? ' · daftar dipotong di 2000 lagu' : '');
    setStatus((notice ? notice + '\n' : '') + (songs.length ? info : 'Belum ada lagu. Ketuk "＋ Tambah lagu" atau "📁 Pilih folder".'));
    if (dirPath) elFold.title = dirPath;
  }
  function renderFolders() {
    if (!panel) return;
    while (elFold.firstChild) elFold.removeChild(elFold.firstChild);
    var h = doc.createElement('div'); h.className = 'hint';
    h.textContent = 'Folder aplikasi (tanpa izin apa pun): ' + (dirPath || '…') + '\nTaruh berkas audio ke sana lewat pengelola berkas / USB, atau pakai "Tambah lagu".';
    elFold.appendChild(h);
    folders.forEach(function (f) {
      var r = doc.createElement('div'); r.className = 'row';
      var l = doc.createElement('span'); l.className = 'ttl'; l.textContent = '📁 ' + (f.name || f.id) + (f.ok ? '' : ' (tidak bisa dibaca — pilih ulang)'); r.appendChild(l);
      var d = doc.createElement('button'); d.className = 'fn'; d.textContent = 'Lupakan';
      twoTap('fold:' + f.id, d, 'Lupakan', 'Yakin?', function () { try { if (B()) B().forgetFolder(f.id); } catch (e) { } });
      r.appendChild(d); elFold.appendChild(r);
    });
  }

  function build() {
    var css = doc.createElement('style');
    css.textContent =
      '#gwSongPanel{position:absolute;inset:0;z-index:80;overflow:auto;padding:12px;box-sizing:border-box;background:var(--kb-bg);color:var(--key-text);font-family:Roboto,system-ui,sans-serif;font-size:.95rem}' +
      '#gwSongPanel .gw-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;margin-bottom:4px;border-bottom:1px solid var(--divider)}' +
      '#gwSongPanel .gw-title{font-size:1rem;font-weight:700}#gwSongPanel .gw-title b{color:var(--key-tag)}' +
      '#gwSongPanel button{margin:3px 4px 3px 0;padding:9px 12px;border:var(--key-border,none);border-radius:var(--key-radius,8px);background:var(--key-bg);color:var(--key-text);font:inherit;box-shadow:0 1px 0 var(--shadow)}' +
      '#gwSongPanel button:active{background:var(--key-active-bg)}#gwSongPanel button.fn{background:var(--key-fn-bg);margin:3px 0}#gwSongPanel button.on{background:var(--key-enter-bg);color:var(--kb-bg);font-weight:600}' +
      'body.theme-light #gwSongPanel button.on{color:var(--key-bubble-text)}#gwSongPanel button:disabled{opacity:.5}' +
      '#gwSongPanel .now{margin:8px 0;padding:10px;background:var(--key-fn-bg);border:1px solid var(--divider);border-radius:var(--key-radius,8px)}' +
      '#gwSongPanel .now .ttl{display:block;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#gwSongPanel .tm{font-size:.8rem;color:var(--muted)}' +
      '#gwSongPanel .ctl{display:flex;gap:4px;align-items:center;flex-wrap:wrap}#gwSongPanel .ctl button{min-width:44px;font-size:1.05rem}' +
      '#gwSongPanel input[type=range]{width:100%;margin:6px 0;accent-color:var(--key-tag)}' +
      '#gwSongPanel input[type=text]{display:block;width:100%;box-sizing:border-box;margin:6px 0;padding:10px;background:var(--key-fn-bg);color:var(--key-text);border:1px solid var(--divider);border-radius:var(--key-radius,8px);font:inherit}' +
      '#gwSongPanel h4{margin:12px 0 4px;font-size:.85rem;font-weight:700;color:var(--key-tag)}#gwSongPanel .hint{font-size:.75rem;color:var(--muted);margin:2px 0 6px;white-space:pre-wrap;word-break:break-word}' +
      '#gwSongPanel .row{display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--divider)}#gwSongPanel .row.cur .song{background:var(--key-active-bg);border-left:3px solid var(--key-tag)}' +
      '#gwSongPanel .song{flex:1;min-width:0;text-align:left;background:transparent;box-shadow:none;margin:0;padding:8px 6px}#gwSongPanel .song .ttl,#gwSongPanel .row>.ttl{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#gwSongPanel .song .sub{display:block;font-size:.72rem;color:var(--muted)}#gwSongPanel .row>.ttl{flex:1;min-width:0;padding:8px 6px}' +
      '#gwSongPanel label{display:flex;gap:8px;align-items:center;margin:6px 0;font-size:.85rem}#gwSongPanel label input{margin:0}';
    doc.head.appendChild(css);
    panel = doc.createElement('div'); panel.id = 'gwSongPanel'; panel.style.display = 'none';
    (doc.getElementById('kbWrap') || doc.body).appendChild(panel);
    function el(tag, text, cls, parent) { var e = doc.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; (parent || panel).appendChild(e); return e; }
    function btn(label, fn, cls, parent) { var b = doc.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', fn); (parent || panel).appendChild(b); return b; }

    var head = el('div', null, 'gw-head'), t = doc.createElement('div'); t.className = 'gw-title'; t.textContent = '🎵 Lagu · '; var tb = doc.createElement('b'); tb.textContent = 'OFFLINE'; t.appendChild(tb); head.appendChild(t);
    btn('✕ Tutup', function () { root.gwSongsClose(); }, 'fn', head);

    var now = el('div', null, 'now'); elNow = el('span', 'Belum ada lagu diputar', 'ttl', now); elTime = el('span', '0:00 / 0:00', 'tm', now);
    elSeek = doc.createElement('input'); elSeek.type = 'range'; elSeek.min = '0'; elSeek.max = '1'; elSeek.value = '0'; elSeek.setAttribute('aria-label', 'Posisi lagu'); now.appendChild(elSeek);
    elSeek.addEventListener('input', function () { seeking = true; elTime.textContent = fmtTime(+elSeek.value) + ' / ' + fmtTime(st.dur); });
    elSeek.addEventListener('change', function () { seeking = false; try { if (B()) B().seek(+elSeek.value | 0); } catch (e) { } });
    var ctl = el('div', null, 'ctl', now);
    btn('⏮', function () { var b = B(); if (b && st.pos > 3000 && (st.state === 'playing' || st.state === 'paused')) { try { b.seek(0); } catch (e) { } } else step(-1, false); }, '', ctl).setAttribute('aria-label', 'Sebelumnya');
    elPlay = btn('▶', togglePlay, '', ctl);
    btn('⏭', function () { step(+1, false); }, '', ctl).setAttribute('aria-label', 'Berikutnya');
    btn('⏹', function () { try { if (B()) B().stop(); } catch (e) { } holdMic(false); }, '', ctl).setAttribute('aria-label', 'Berhenti');
    elShuf = btn('', function () { prefs.shuffle = !prefs.shuffle; savePrefs(); renderNow(); }, '', now);
    elRep = btn('', function () { prefs.repeat = prefs.repeat === 'off' ? 'all' : prefs.repeat === 'all' ? 'one' : 'off'; savePrefs(); renderNow(); }, '', now);
    el('span', 'Volume', 'tm', now);
    elVol = doc.createElement('input'); elVol.type = 'range'; elVol.min = '0'; elVol.max = '100'; elVol.value = String(prefs.volume); elVol.setAttribute('aria-label', 'Volume'); now.appendChild(elVol);
    elVol.addEventListener('input', function () { prefs.volume = +elVol.value | 0; savePrefs(); try { if (B()) B().setVolume(prefs.volume); } catch (e) { } });

    var add = el('div', null, 'ctl');
    btn('＋ Tambah lagu', function () { var b = B(); if (!b) { refresh(); return; } setStatus('Membuka pemilih berkas…'); try { b.addSongs(); } catch (e) { setStatus('✗ ' + errText('picker-failed')); } }, '', add);
    btn('📁 Pilih folder', function () { var b = B(); if (!b) { refresh(); return; } setStatus('Membuka pemilih folder…'); try { b.addFolder(); } catch (e) { setStatus('✗ ' + errText('picker-failed')); } }, '', add);
    btn('↻ Muat ulang', refresh, 'fn', add);
    el('div', '"Tambah lagu" menyalin berkas ke folder aplikasi. "Pilih folder" memutar lagu di tempatnya (pilih subfolder seperti Music; Android menolak akar penyimpanan dan folder Download).', 'hint');

    elStatus = el('div', 'Memuat…', 'hint'); elStatus.id = 'gwsong-status';
    elFind = doc.createElement('input'); elFind.type = 'text'; elFind.placeholder = 'Cari lagu…'; elFind.maxLength = 60; elFind.autocomplete = 'off'; elFind.spellcheck = false; panel.appendChild(elFind);
    elFind.addEventListener('input', function () { query = elFind.value; render(); });
    elList = el('div', null, 'list');
    el('h4', 'Folder');
    elFold = el('div', null, 'folders');
    el('h4', 'Pengaturan');
    var l1 = el('label'); elHold = doc.createElement('input'); elHold.type = 'checkbox'; elHold.checked = prefs.holdMic; l1.appendChild(elHold); el('span', 'Matikan mikrofon gitar selama lagu diputar (cegah huruf hantu dari speaker)', null, l1);
    elHold.addEventListener('change', function () { prefs.holdMic = elHold.checked; savePrefs(); if (!prefs.holdMic) { try { if (root.gwMicHold) root.gwMicHold(false); } catch (e) { } } else holdMic(st.state === 'playing' || st.state === 'loading'); });
    var l2 = el('label'); elHide = doc.createElement('input'); elHide.type = 'checkbox'; elHide.checked = prefs.stopOnHide; l2.appendChild(elHide); el('span', 'Hentikan lagu saat keyboard ditutup (kalau mati, lagu terus main sementara kamu mengetik di aplikasi lain)', null, l2);
    elHide.addEventListener('change', function () { prefs.stopOnHide = elHide.checked; savePrefs(); });
  }

  root.gwSongsOpen = function () {
    loadPrefs();
    if (!panel) { build(); }
    elHold.checked = prefs.holdMic; elHide.checked = prefs.stopOnHide; elVol.value = String(prefs.volume);
    panel.style.display = 'block';
    var b = B(); if (b) { try { var s = parseJSON(b.state()); if (s && s.state && s.state !== 'idle') st = { id: String(s.id || ''), state: String(s.state), pos: +s.pos || 0, dur: +s.dur || 0, err: '' }; } catch (e) { } }
    renderNow(); renderFolders(); refresh();
  };
  root.gwSongsClose = function () { if (panel) panel.style.display = 'none'; };
})(typeof window !== 'undefined' ? window : globalThis);
