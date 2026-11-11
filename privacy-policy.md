# Kebijakan Privasi — Guitarwiter

_Terakhir diperbarui: 11 November 2026 (v1.9.0: Fitur cerdas, Terjemah, dan Lirik AI memakai satu mesin Gemini opsional)_

Guitarwiter adalah keyboard Android yang mengubah nada gitar (lewat mikrofon) menjadi ketikan. Kebijakan ini menjelaskan data apa yang disentuh aplikasi dan ke mana perginya.

**Ringkasnya: semua diproses di perangkatmu. Guitarwiter tidak mengirim apa pun ke server mana pun, tidak memakai iklan, dan tidak memakai analitik/pelacak — satu-satunya pengecualian adalah fitur Gemini (Google) yang opsional dan mati secara bawaan: Lirik AI, tombol ☁ di Fitur cerdas, dan mesin "Gemini online" di Terjemah — lihat bagian 12 (lihat bagian 12).**

## 1. Mikrofon
- Izin **RECORD_AUDIO** dipakai hanya untuk mendeteksi nada gitar secara *real-time* di dalam aplikasi.
- Audio **tidak direkam, tidak disimpan, dan tidak dikirim**. Suara langsung dianalisis dan dibuang; yang dipakai hanya hasilnya (nada apa yang terdengar).
- Mikrofon hanya aktif saat fitur deteksi nada dinyalakan.

## 2. Teks yang kamu ketik
- Keyboard memproses teks yang kamu ketik **secara lokal** untuk saran kata, autokoreksi, dan huruf kapital otomatis.
- Di **kolom privat** (kata sandi, mode penyamaran/incognito, atau kolom yang meminta tanpa personalisasi), keyboard **tidak belajar kata, tidak menyimpan pasangan kata, dan tidak menampilkan saran**.

## 3. Data yang disimpan di perangkat
Disimpan di penyimpanan lokal aplikasi (tidak keluar dari perangkat):
- kata yang dipelajari dan pasangan kata untuk saran berikutnya,
- pengaturan (bahasa, tema, ukuran keyboard, tombol yang ditampilkan, dll.),
- daftar kata yang kamu blokir dari saran,
- riwayat papan klip yang ditampilkan sebagai saran.

Semuanya bisa dihapus lewat **Pengaturan Android → Aplikasi → Guitarwiter → Penyimpanan → Hapus data**, atau dengan menghapus aplikasi.

## 4. Papan klip
Guitarwiter membaca salinan terbaru di papan klip hanya untuk menampilkannya sebagai saran tempel. Isinya disimpan lokal dan tidak dikirim ke mana pun.

## 5. Jaringan & pihak ketiga
- Tidak ada pengiriman data ke server, tidak ada iklan, tidak ada SDK analitik.
- Tab GIF berjalan offline (stiker emoji); tidak ada permintaan ke layanan GIF.

## 6. Anak-anak
Aplikasi tidak menargetkan anak-anak secara khusus dan tidak mengumpulkan data pribadi dari siapa pun.

## 7. Perubahan kebijakan
Jika kebijakan ini berubah, versi terbarunya akan ditampilkan di halaman ini beserta tanggal pembaruan.

## 8. Kontak
Pertanyaan soal privasi: **[ISI EMAIL KONTAK KAMU DI SINI]**

---

### English summary
Guitarwiter processes everything on your device. The microphone (RECORD_AUDIO) is used only for real-time pitch detection; audio is never recorded, stored, or transmitted. Typed text, learned words, settings, and clipboard suggestions stay in local app storage and can be cleared by clearing app data. No ads, analytics, trackers, or network data transfer. In private/password fields the keyboard does not learn or suggest words. Contact: **[ADD YOUR CONTACT EMAIL HERE]**

## 9. Fitur cerdas (offline) — Setelan → Eksperimental → "Fitur cerdas (offline)"
Bawaannya **mati**. Saat dinyalakan, semua dikerjakan **di perangkat Anda**: mengubah tab dengan perintah, membuat lagu dan lirik dari akor, mengubah humming jadi lagu, perpustakaan tab lagu, segmentasi frasa, dan sampul lagu.
- **Tidak ada koneksi internet, tidak ada API, tidak ada kunci, tidak ada layanan pihak ketiga.** Tidak ada teks, tab, rekaman, atau gambar yang dikirim ke mana pun.
- Rekaman humming 30 detik hanya disimpan di memori selama dianalisis (melodinya dibaca di perangkat), lalu dibuang saat selesai atau dibatalkan. Tidak disimpan ke penyimpanan.
- Tab terakhir yang Anda buka disimpan di penyimpanan lokal aplikasi (`lastTab`) agar bisa dilanjutkan; hapus data aplikasi untuk menghapusnya.
- Versi lama (1.4.x) yang memakai layanan online menyimpan kunci API di perangkat. Versi ini menghapus kunci itu saat dimuat.

## 10. Terjemah — Setelan → Eksperimental → "Fitur cerdas (offline)" → "⑥ Terjemah"
- Terjemah **secara bawaan offline** (kamus bawaan, dan Meta Llama bila model dipasang): teks di kotak Terjemah diproses di perangkat; mode "Otomatis" tidak pernah online. Satu-satunya jalur online adalah mesin "Gemini online" yang kamu pilih sendiri (bagian 12).
- Mesin online "Spark" (Meta Model API) yang ada di v1.6.0–1.7.0 **sudah dihapus di v1.8.0**, begitu pula kunci API-nya (hapus data aplikasi bila ingin membersihkan sisa kunci lama).

## 11. Pemutar lagu offline (v1.7.0) — kisi alat → "Lagu offline"
- Lagu diputar **sepenuhnya di perangkat** lewat pemutar bawaan Android. Tidak ada koneksi jaringan, tidak ada unggahan, tidak ada pelacakan lagu apa yang kamu putar.
- Aplikasi **tidak meminta izin penyimpanan**. Ia hanya membaca berkas yang kamu pilih sendiri lewat pemilih berkas sistem: (a) "Tambah lagu" **menyalin** berkas pilihanmu ke folder aplikasi (`Android/data/com.keyboardkustom.app/files/songs/`); (b) "Pilih folder" memberi izin **baca saja** atas satu folder yang kamu pilih, dan lagu dimainkan di tempatnya tanpa disalin atau diubah. Izin itu bisa dilepas lewat tombol "Lupakan" atau dengan menghapus data aplikasi.
- Yang disimpan di perangkat: daftar folder yang kamu pilih, lagu terakhir yang diputar, dan pengaturan pemutar (acak, ulang, volume, dua opsi). Nama berkas hanya ditampilkan di layar.
- Selama lagu diputar, mikrofon deteksi gitar dimatikan (supaya suara speaker tidak terbaca sebagai nada) dan hidup lagi saat lagu dijeda atau berhenti.

## 12. Gemini (Google) — Lirik AI, tombol ☁ di Fitur cerdas, dan mesin "Gemini online" di Terjemah (v1.8.0–1.9.0)
- **MATI secara bawaan.** Hanya jika kamu (1) menyalakannya (dua ketukan), (2) memasukkan **kunci API Gemini milikmu sendiri**, dan (3) menekan "Bikin Lagu", **teks permintaan di kotak itu saja** (maks 300 karakter) dikirim lewat https ke `generativelanguage.googleapis.com` bersama instruksi tetap "penulis lagu". Ketikan keyboard biasa, audio/mikrofon, tab, papan klip, dan daftar lagu tidak pernah dikirim. Tidak ada kunci di dalam aplikasi.
- Kunci disimpan hanya di penyimpanan lokal aplikasi di perangkat ini dan dikirim hanya di header `x-goog-api-key`. "Hapus kunci" menghapusnya dari perangkat (cabut juga di Google AI Studio bila pernah bocor).
- Pemrosesan oleh Google mengikuti ketentuan Gemini API; pada tingkat gratis, Google dapat memakai isi permintaan dan jawaban untuk meningkatkan produknya. Jangan menulis data pribadi di kotak permintaan.
- Lagu hasil Gemini **otomatis disimpan hanya di perangkat** (penyimpanan lokal aplikasi) dan bisa dibuka lagi tanpa internet; tombol 🗑 atau menghapus data aplikasi menghapusnya. Tidak ada unggahan, akun, analitik, atau pelacak.
- **Satu kunci, satu saklar untuk semuanya (v1.9.0).** Hanya saat kamu mengetuk salah satu tombol Gemini, yang dikirim adalah **teks yang kamu tulis di kotak fitur itu**: permintaan lagu (maks 300 karakter), akor (maks 16, divalidasi dulu di perangkat) + suasana, perintah tab (maks 100 karakter), atau teks terjemahan (maks 500 karakter), bersama instruksi tetap. **Tidak pernah dikirim:** audio/humming, isi tab, ketikan keyboard biasa, papan klip, daftar lagu, nama berkas.
- Untuk perintah tab, Gemini hanya **memilih dari daftar perintah yang diizinkan**; jawaban lain dibuang dan tab diubah oleh editor offline di perangkat.
