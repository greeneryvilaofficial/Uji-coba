// Service worker sederhana untuk Guitar Witer.
// Fungsinya: menyimpan file inti di cache supaya halaman tetap bisa
// dimuat walau tanpa koneksi internet (penting karena WebView keyboard
// akan sering dibuka tanpa jaringan aktif).

const CACHE_NAME = 'genjreng-ketik-cache-v36'; // v1.9.1: service worker tidak lagi menelan POST/lintas-origin (Gemini offline kini jujur); v1.9.0: Fitur cerdas + Terjemah + Lirik AI satu mesin Gemini (opsional) dengan navbar bersama; v1.8.0: Muse Spark online diganti Gemini untuk lirik lagu (lib/online/gemini.js, lib/offline/lyrics-store.js, lib/ui/lyrics-panel.js); v1.7.0: pemutar lagu offline (player/songplayer.js + folder lokal); v1.6.0: modul terjemah (lib/: Llama offline, kamus, Muse Spark online opsional); v1.5.1: panel ikut tema keyboard + diagnosis modul; v1.5.0: semua AI offline (tanpa API); v1.4.7: Wonder lewat endpoint chat + model wajib; v1.4.6: Wonder hemat (melodi lokal, jatah 1x, saklar mati); v1.4.5: kolom API Key/Endpoint/Test Connection; v1.4.0: modul AI (Muse); (v1.3.9 petikan gitar dihapus); v1.3.8: pembanding harmonik terkuat, zona rendah lebih cepat; v1.3.7: turun oktaf butuh harmonik ganjil (p/a/s tidak lagi jadi angka)
const CORE_ASSETS = [
  'index.html',
  'ai/ai-core.js',
  'ai/music.js',
  'ai/lyrics.js',
  'ai/songgen.js',
  'ai/songs.js',
  'ai/editor.js',
  'ai/generate-full.js',
  'ai/waveform.js',
  'player/songplayer.js',
  'lib/core.js',
  'lib/offline/dict-data.js',
  'lib/offline/dict-engine.js',
  'lib/offline/llama.js',
  'lib/online/gemini.js',
  'lib/offline/lyrics-store.js',
  'lib/ui/lyrics-panel.js',
  'lib/router.js',
  'lib/ui/translate-panel.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

// Saat pertama kali dipasang: simpan file inti ke cache.
self.addEventListener('install', (event) => {
  event.waitUntil(
    // Satu per satu + tangkap error: cache.addAll() gagal TOTAL kalau satu aset saja
    // hilang/404 (mis. icon belum ada), sehingga service worker tidak pernah terpasang.
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(CORE_ASSETS.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

// Saat aktif: bersihkan cache versi lama kalau ada.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Strategi: untuk berkas aplikasi (GET, satu origin) coba cache dulu, baru jaringan.
//
// Permintaan LAIN sengaja DIBIARKAN ke peramban (service worker tidak ikut campur):
//   - non-GET, mis. POST ke Gemini (fitur online opsional), dan
//   - lintas-origin (host lain).
// Alasan (bug nyata, ditemukan lewat tools/e2e/panels-e2e.py): kalau service worker ikut menangani POST Gemini dan
// jaringan gagal, fallback lama membalas dengan index.html berstatus 200; aplikasi lalu menyangka "dapat jawaban"
// dan menampilkan "Jawaban kosong" alih-alih "Tidak ada koneksi".
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req).catch(() => {
          // Offline dan tidak ada di cache: hanya NAVIGASI yang boleh jatuh ke index.html. Untuk skrip/gambar yang
          // hilang, kembalikan galat jaringan yang jujur (HTML sebagai pengganti .js hanya membuat SyntaxError yang membingungkan).
          return req.mode === 'navigate' ? caches.match('index.html') : Response.error();
        })
      );
    })
  );
});
