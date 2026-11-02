package com.keyboardkustom.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * [LABEL SONGS / BRIDGE] Pemutar lagu OFFLINE untuk keyboard. Terdaftar di WebView sebagai window.AndroidSongs.
 * Kontrak JS: www/player/songplayer.js.
 *
 * Dua sumber lagu (keduanya lokal, tanpa jaringan):
 *  1) Folder aplikasi  Android/data/com.keyboardkustom.app/files/songs/   id = "f:<namaberkas>"
 *     - tanpa izin penyimpanan apa pun; bisa diisi lewat "Tambah lagu" (berkas disalin ke sini)
 *       atau ditaruh sendiri lewat aplikasi pengelola berkas / kabel USB.
 *  2) Folder pilihan pengguna (Storage Access Framework, izin tetap)   id = "u:<content-uri>"
 *     - lagu dimainkan di tempatnya, tidak disalin. Pengguna memilih lewat "Pilih folder".
 *
 * Memutar lewat MediaPlayer bawaan Android, jadi format yang bisa dimainkan = format yang didukung HP
 * (umumnya mp3, m4a/aac, ogg, opus, wav, flac, mid). Tidak ada pustaka tambahan.
 */
public class SongPlayerBridge {

    static final String PREFS = "gw_songs";
    static final String KEY_TREES = "trees";
    private static final int MAX_SONGS = 2000;
    private static final int MAX_DEPTH = 4;
    private static final Set<String> EXT = new HashSet<String>(Arrays.asList(
            "mp3", "m4a", "aac", "ogg", "oga", "opus", "wav", "flac", "mid", "midi", "amr", "3gp", "mka"));

    /** Instans yang sedang hidup (untuk SongPickerActivity memberi kabar ke WebView). */
    static volatile SongPlayerBridge active;
    /** Satu antrean untuk semua penyalinan / pemindaian, supaya tidak berebut disk. */
    static final ExecutorService IO = Executors.newSingleThreadExecutor();

    private final Context ctx;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());

    // Semua yang di bawah ini HANYA disentuh di main thread (lewat main.post), kecuali lastState.
    private MediaPlayer mp;
    private String curId = "";
    private boolean wantPlay = false;
    private boolean prepared = false;
    private boolean pausedByFocus = false;
    private boolean ducked = false;
    private float vol = 1f;
    private AudioManager am;
    private AudioManager.OnAudioFocusChangeListener focusL;
    private AudioFocusRequest focusReq;
    private volatile String lastState = "{\"id\":\"\",\"state\":\"idle\",\"pos\":0,\"dur\":0}";

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (mp != null && prepared && wantPlay) {
                push("playing", "");
                main.postDelayed(this, 500);
            }
        }
    };

    public SongPlayerBridge(Context ctx, WebView web) {
        this.ctx = ctx;
        this.web = web;
        this.am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        active = this;
    }

    // ------------------------------------------------------------------ util

    private static String q(String s) {   // literal string JSON/JS yang aman
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20 || c == 0x2028 || c == 0x2029) b.append(String.format(Locale.US, "\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    static File songsDir(Context c) {
        File base = c.getExternalFilesDir(null);
        if (base == null) base = c.getFilesDir();
        File d = new File(base, "songs");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static String extOf(String name) {
        int i = name.lastIndexOf('.');
        return (i < 0 || i == name.length() - 1) ? "" : name.substring(i + 1).toLowerCase(Locale.US);
    }

    static boolean isAudioName(String name) { return EXT.contains(extOf(name)); }

    private static String stripExt(String name) {
        int i = name.lastIndexOf('.');
        return (i > 0 && name.length() - i <= 6) ? name.substring(0, i) : name;
    }

    /** Nama berkas aman: tanpa pemisah path / karakter kontrol, tidak diawali titik, maks 120 karakter (ekstensi dipertahankan). */
    static String sanitize(String name) {
        if (name == null) name = "";
        name = name.replaceAll("[\\\\/:*?\"<>|\\u0000-\\u001f]", "_").trim();
        while (name.startsWith(".")) name = name.substring(1);
        if (name.length() > 120) {
            String e = extOf(name);
            String stem = stripExt(name);
            int keep = 120 - (e.isEmpty() ? 0 : e.length() + 1);
            name = stem.substring(0, Math.max(1, Math.min(stem.length(), keep))) + (e.isEmpty() ? "" : "." + e);
        }
        return name;
    }

    private SharedPreferences prefs() { return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static Set<String> trees(Context c) {
        Set<String> s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet(KEY_TREES, null);
        return s == null ? new HashSet<String>() : new HashSet<String>(s);   // salin: StringSet bawaan tidak boleh diubah
    }

    static void saveTrees(Context c, Set<String> s) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet(KEY_TREES, new HashSet<String>(s)).apply();
    }

    // ------------------------------------------------------------------ kabar ke JS

    private void js(final String code) {
        if (web == null) return;
        web.post(new Runnable() { @Override public void run() { web.evaluateJavascript(code, null); } });
    }

    /** Dipanggil SongPickerActivity / penyalinan selesai. info = JSON kecil {"added":n,"failed":n,"folder":bool}. */
    static void notifyChanged(String infoJson) {
        SongPlayerBridge b = active;
        if (b != null) b.js("window.onSongsChanged&&window.onSongsChanged(" + q(infoJson) + ")");
    }

    private void push(String state, String err) {
        int pos = 0, dur = 0;
        try {
            if (mp != null && prepared) { pos = mp.getCurrentPosition(); dur = mp.getDuration(); }
        } catch (Throwable ignored) { }
        String j = "{\"id\":" + q(curId) + ",\"state\":" + q(state) + ",\"pos\":" + pos + ",\"dur\":" + Math.max(0, dur)
                + ",\"err\":" + q(err) + "}";
        lastState = j;
        js("window.onSongState&&window.onSongState(" + q(j) + ")");
    }

    // ------------------------------------------------------------------ daftar lagu

    @JavascriptInterface
    public String state() { return lastState; }

    @JavascriptInterface
    public String listAsync(final int reqId) {
        IO.execute(new Runnable() {
            @Override public void run() {
                String json;
                try { json = buildList(); }
                catch (Throwable t) { json = "{\"ok\":false,\"error\":" + q(t.getClass().getSimpleName()) + "}"; }
                js("window.__gwSongsResult&&window.__gwSongsResult(" + reqId + "," + q(json) + ")");
            }
        });
        return "";
    }

    private static class Item { String id, title, src; long size; }

    private String buildList() {
        List<Item> items = new ArrayList<Item>();
        File dir = songsDir(ctx);
        File[] fs = dir.listFiles();
        if (fs != null) {
            Arrays.sort(fs, new Comparator<File>() {
                @Override public int compare(File a, File b) { return a.getName().compareToIgnoreCase(b.getName()); }
            });
            for (File f : fs) {
                if (items.size() >= MAX_SONGS) break;
                if (f.isFile() && f.length() > 0 && isAudioName(f.getName())) {
                    Item it = new Item(); it.id = "f:" + f.getName(); it.title = stripExt(f.getName()); it.src = "app"; it.size = f.length();
                    items.add(it);
                }
            }
        }
        StringBuilder folders = new StringBuilder();
        boolean truncated = false;
        for (String t : trees(ctx)) {
            Uri tu = Uri.parse(t);
            if (folders.length() > 0) folders.append(',');
            String fname = t;
            boolean ok = true;
            try {
                String docId = DocumentsContract.getTreeDocumentId(tu);
                int cut = docId.lastIndexOf(':') >= 0 ? docId.lastIndexOf(':') + 1 : 0;
                String tail = docId.substring(cut);
                fname = tail.isEmpty() ? docId : tail;
                List<Item> sub = new ArrayList<Item>();
                walk(tu, docId, 0, sub, fname);
                Collections.sort(sub, new Comparator<Item>() {
                    @Override public int compare(Item a, Item b) { return a.title.compareToIgnoreCase(b.title); }
                });
                for (Item it : sub) { if (items.size() >= MAX_SONGS) { truncated = true; break; } items.add(it); }
            } catch (Throwable e) { ok = false; }   // izin dicabut / folder dihapus
            folders.append("{\"id\":").append(q(t)).append(",\"name\":").append(q(fname)).append(",\"ok\":").append(ok).append('}');
        }
        StringBuilder sb = new StringBuilder("{\"ok\":true,\"dir\":").append(q(dir.getAbsolutePath())).append(",\"truncated\":").append(truncated).append(",\"songs\":[");
        for (int i = 0; i < items.size(); i++) {
            Item it = items.get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"id\":").append(q(it.id)).append(",\"title\":").append(q(it.title)).append(",\"src\":").append(q(it.src)).append(",\"size\":").append(it.size).append('}');
        }
        return sb.append("],\"folders\":[").append(folders).append("]}").toString();
    }

    private void walk(Uri tree, String parentDocId, int depth, List<Item> out, String folderName) {
        if (depth > MAX_DEPTH || out.size() >= MAX_SONGS) return;
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentDocId);
        Cursor c = null;
        try {
            c = ctx.getContentResolver().query(children, new String[]{
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE}, null, null, null);
            if (c == null) return;
            while (c.moveToNext() && out.size() < MAX_SONGS) {
                String docId = c.getString(0), name = c.getString(1), mime = c.getString(2);
                long size = c.isNull(3) ? 0 : c.getLong(3);
                if (docId == null || name == null) continue;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) { walk(tree, docId, depth + 1, out, folderName); continue; }
                boolean audio = isAudioName(name) || (mime != null && mime.startsWith("audio/"));
                if (!audio || size == 0) continue;
                Item it = new Item();
                it.id = "u:" + DocumentsContract.buildDocumentUriUsingTree(tree, docId).toString();
                it.title = stripExt(name); it.src = folderName; it.size = size;
                out.add(it);
            }
        } finally { if (c != null) c.close(); }
    }

    // ------------------------------------------------------------------ tambah / pilih folder / hapus

    /** Buka pemilih berkas (tambah lagu = disalin ke folder aplikasi). */
    @JavascriptInterface
    public void addSongs() { launchPicker("add"); }

    /** Buka pemilih folder (lagu dimainkan di tempatnya; izin disimpan tetap). */
    @JavascriptInterface
    public void addFolder() { launchPicker("folder"); }

    private void launchPicker(final String mode) {
        main.post(new Runnable() {
            @Override public void run() {
                try {
                    Intent i = new Intent(ctx, SongPickerActivity.class);
                    // Dari Service WAJIB NEW_TASK. taskAffinity kosong di manifest membuatnya tugas sendiri, jadi setelah selesai
                    // pengguna kembali ke aplikasi yang sedang diketik (bukan ke layar Guitarwiter).
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);   // JANGAN NO_HISTORY: activity itu langsung ditutup saat pemilih terbuka, hasilnya hilang
                    i.putExtra(SongPickerActivity.EXTRA_MODE, mode);
                    ctx.startActivity(i);
                } catch (Throwable t) {
                    notifyChanged("{\"added\":0,\"failed\":0,\"error\":\"picker-failed\"}");
                }
            }
        });
    }

    /** Hapus lagu dari FOLDER APLIKASI saja (lagu di folder pilihan pengguna tidak pernah dihapus). */
    @JavascriptInterface
    public void removeSong(final String id) {
        main.post(new Runnable() { @Override public void run() { if (id != null && id.equals(curId)) doStop(); } });
        IO.execute(new Runnable() {
            @Override public void run() {
                boolean ok = false;
                File f = resolveFile(id);
                if (f != null && f.isFile()) ok = f.delete();
                notifyChanged("{\"removed\":" + (ok ? 1 : 0) + ",\"failed\":" + (ok ? 0 : 1) + "}");
            }
        });
    }

    /** Lupakan folder pilihan (lepas izin). Berkas di dalamnya tidak disentuh. */
    @JavascriptInterface
    public void forgetFolder(final String treeUri) {
        main.post(new Runnable() { @Override public void run() {
            if (treeUri != null && curId.startsWith("u:" + treeUri + "/document/")) doStop();
        } });
        IO.execute(new Runnable() {
            @Override public void run() {
                Set<String> s = trees(ctx);
                if (treeUri != null && s.remove(treeUri)) {
                    saveTrees(ctx, s);
                    try { ctx.getContentResolver().releasePersistableUriPermission(Uri.parse(treeUri), Intent.FLAG_GRANT_READ_URI_PERMISSION); }
                    catch (Throwable ignored) { }
                }
                notifyChanged("{\"folder\":true,\"added\":0,\"failed\":0}");
            }
        });
    }

    /** id "f:nama" -> berkas DI DALAM folder lagu aplikasi (tanpa path traversal), selain itu null. */
    private File resolveFile(String id) {
        if (id == null || !id.startsWith("f:")) return null;
        String name = id.substring(2);
        if (name.isEmpty() || name.indexOf('/') >= 0 || name.indexOf('\\') >= 0 || name.startsWith(".") || name.indexOf('\0') >= 0) return null;
        try {
            File dir = songsDir(ctx).getCanonicalFile();
            File f = new File(dir, name).getCanonicalFile();
            return dir.equals(f.getParentFile()) ? f : null;
        } catch (Throwable t) { return null; }
    }

    /** id "u:<uri>" -> Uri HANYA kalau berada di bawah salah satu folder yang memang pernah dipilih pengguna. */
    private Uri resolveUri(String id) {
        if (id == null || !id.startsWith("u:")) return null;
        String u = id.substring(2);
        for (String t : trees(ctx)) if (u.startsWith(t + "/document/")) return Uri.parse(u);
        return null;
    }

    // ------------------------------------------------------------------ memutar

    @JavascriptInterface
    public void play(final String id) { main.post(new Runnable() { @Override public void run() { doPlay(id); } }); }

    @JavascriptInterface
    public void pause() { main.post(new Runnable() { @Override public void run() {
        if (mp == null || !prepared) return;
        wantPlay = false; pausedByFocus = false;
        try { if (mp.isPlaying()) mp.pause(); } catch (Throwable ignored) { }
        main.removeCallbacks(ticker); push("paused", "");
    } }); }

    @JavascriptInterface
    public void resume() { main.post(new Runnable() { @Override public void run() {
        if (mp == null || !prepared) return;
        if (!requestFocus()) { push("error", "focus-denied"); return; }
        wantPlay = true;
        try { mp.start(); } catch (Throwable t) { push("error", "start-failed"); return; }
        push("playing", ""); main.removeCallbacks(ticker); main.postDelayed(ticker, 500);
    } }); }

    @JavascriptInterface
    public void stop() { main.post(new Runnable() { @Override public void run() { doStop(); } }); }

    @JavascriptInterface
    public void seek(final int ms) { main.post(new Runnable() { @Override public void run() {
        if (mp == null || !prepared) return;
        try { mp.seekTo(Math.max(0, Math.min(ms, mp.getDuration()))); } catch (Throwable ignored) { }
        push(wantPlay ? "playing" : "paused", "");
    } }); }

    /** 0..100 */
    @JavascriptInterface
    public void setVolume(final int percent) { main.post(new Runnable() { @Override public void run() {
        vol = Math.max(0, Math.min(100, percent)) / 100f;
        applyVolume();
    } }); }

    private void applyVolume() {
        if (mp == null) return;
        float v = ducked ? vol * 0.25f : vol;
        try { mp.setVolume(v, v); } catch (Throwable ignored) { }
    }

    private void doPlay(String id) {
        File f = resolveFile(id);
        Uri u = f == null ? resolveUri(id) : null;
        if (f == null && u == null) { curId = id == null ? "" : id; push("error", "bad-id"); return; }
        if (f != null && !f.isFile()) { curId = id; push("error", "file-missing"); return; }
        releasePlayer();
        curId = id; wantPlay = true; prepared = false; pausedByFocus = false; ducked = false;
        if (!requestFocus()) { wantPlay = false; push("error", "focus-denied"); return; }
        push("loading", "");
        try {
            final MediaPlayer p = new MediaPlayer();
            mp = p;
            p.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            if (f != null) p.setDataSource(f.getAbsolutePath()); else p.setDataSource(ctx, u);
            p.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                @Override public void onPrepared(MediaPlayer m) {
                    if (m != mp) return;
                    prepared = true; applyVolume();
                    if (wantPlay) { try { m.start(); } catch (Throwable t) { push("error", "start-failed"); return; } }
                    push(wantPlay ? "playing" : "paused", "");
                    main.removeCallbacks(ticker); if (wantPlay) main.postDelayed(ticker, 500);
                }
            });
            p.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override public void onCompletion(MediaPlayer m) {
                    if (m != mp) return;
                    wantPlay = false; main.removeCallbacks(ticker);
                    push("ended", "");
                    abandonFocus();
                }
            });
            p.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override public boolean onError(MediaPlayer m, int what, int extra) {
                    if (m != mp) return true;
                    String err = (what == MediaPlayer.MEDIA_ERROR_UNKNOWN && extra == -1004) ? "unsupported-or-unreadable" : "play-error-" + what + "/" + extra;
                    wantPlay = false; main.removeCallbacks(ticker); releasePlayer();
                    push("error", err);
                    return true;
                }
            });
            p.prepareAsync();
        } catch (Throwable t) {
            wantPlay = false; releasePlayer();
            push("error", "open-failed");
        }
    }

    private void doStop() {
        wantPlay = false; main.removeCallbacks(ticker);
        releasePlayer(); abandonFocus();
        curId = "";
        push("idle", "");
    }

    private void releasePlayer() {
        main.removeCallbacks(ticker);
        MediaPlayer p = mp; mp = null; prepared = false;
        if (p != null) {
            try { p.setOnPreparedListener(null); p.setOnCompletionListener(null); p.setOnErrorListener(null); } catch (Throwable ignored) { }
            try { p.reset(); } catch (Throwable ignored) { }
            try { p.release(); } catch (Throwable ignored) { }
        }
    }

    // ------------------------------------------------------------------ fokus audio

    private boolean requestFocus() {
        if (am == null) return true;
        if (focusL == null) {
            focusL = new AudioManager.OnAudioFocusChangeListener() {
                @Override public void onAudioFocusChange(int change) { onFocus(change); }
            };
        }
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                if (focusReq == null) {
                    focusReq = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                            .setAudioAttributes(new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                            .setOnAudioFocusChangeListener(focusL).build();
                }
                return am.requestAudioFocus(focusReq) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
            }
            return am.requestAudioFocus(focusL, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } catch (Throwable t) { return true; }
    }

    private void abandonFocus() {
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 26) { if (focusReq != null) am.abandonAudioFocusRequest(focusReq); }
            else if (focusL != null) am.abandonAudioFocus(focusL);
        } catch (Throwable ignored) { }
    }

    private void onFocus(final int change) {
        main.post(new Runnable() { @Override public void run() {
            if (mp == null || !prepared) return;
            switch (change) {
                case AudioManager.AUDIOFOCUS_LOSS:   // aplikasi lain mengambil alih (mis. pemutar musik): berhenti sopan
                    wantPlay = false; pausedByFocus = false; main.removeCallbacks(ticker);
                    try { if (mp.isPlaying()) mp.pause(); } catch (Throwable ignored) { }
                    push("paused", ""); abandonFocus(); break;
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:   // panggilan / notifikasi: jeda, lanjut sendiri nanti
                    if (wantPlay) { pausedByFocus = true; wantPlay = false; main.removeCallbacks(ticker);
                        try { if (mp.isPlaying()) mp.pause(); } catch (Throwable ignored) { }
                        push("paused", ""); }
                    break;
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                    ducked = true; applyVolume(); break;
                case AudioManager.AUDIOFOCUS_GAIN:
                    ducked = false; applyVolume();
                    if (pausedByFocus) { pausedByFocus = false; wantPlay = true;
                        try { mp.start(); } catch (Throwable ignored) { }
                        push("playing", ""); main.postDelayed(ticker, 500); }
                    break;
                default: break;
            }
        } });
    }

    /** Dipanggil HtmlKeyboardService.onDestroy(). */
    public void release() {
        main.removeCallbacksAndMessages(null);
        releasePlayer(); abandonFocus();
        if (active == this) active = null;
    }

    // ------------------------------------------------------------------ penyalinan (dipanggil SongPickerActivity, di thread latar)

    /** Salin lagu pilihan pengguna ke folder aplikasi. Mengembalikan {berhasil, gagal}. */
    static int[] copyIn(Context c, List<Uri> uris) {
        int ok = 0, bad = 0;
        ContentResolver cr = c.getContentResolver();
        File dir = songsDir(c);
        for (Uri u : uris) {
            File tmp = null;
            try {
                String name = null; long size = -1; String mime = cr.getType(u);
                Cursor cur = null;
                try {
                    cur = cr.query(u, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null);
                    if (cur != null && cur.moveToFirst()) {
                        if (!cur.isNull(0)) name = cur.getString(0);
                        if (!cur.isNull(1)) size = cur.getLong(1);
                    }
                } finally { if (cur != null) cur.close(); }
                name = sanitize(name);
                if (!isAudioName(name)) {
                    String ext = (mime != null && mime.startsWith("audio/")) ? MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) : null;
                    if (ext == null || !EXT.contains(ext)) { bad++; continue; }   // bukan audio yang dikenal
                    name = (name.isEmpty() ? "lagu" : name) + "." + ext;
                }
                if (size >= 0 && dir.getUsableSpace() < size + 16L * 1024 * 1024) { bad++; continue; }   // ruang penyimpanan hampir penuh
                String stem = stripExt(name), e = extOf(name);
                File dst = new File(dir, name);
                for (int n = 2; dst.exists() && n < 1000; n++) dst = new File(dir, stem + " (" + n + ")." + e);
                if (dst.exists()) { bad++; continue; }
                tmp = new File(dir, dst.getName() + ".part");
                InputStream in = cr.openInputStream(u);
                if (in == null) { bad++; continue; }
                OutputStream out = new FileOutputStream(tmp);
                try {
                    byte[] buf = new byte[64 * 1024]; int r;
                    while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
                    out.flush();
                } finally { try { in.close(); } catch (Throwable ignored) { } try { out.close(); } catch (Throwable ignored) { } }
                if (tmp.length() > 0 && tmp.renameTo(dst)) ok++; else { tmp.delete(); bad++; }
            } catch (Throwable t) {
                bad++;
                if (tmp != null) tmp.delete();
            }
        }
        return new int[]{ok, bad};
    }
}
