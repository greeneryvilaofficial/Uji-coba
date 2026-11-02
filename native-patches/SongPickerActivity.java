package com.keyboardkustom.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * [LABEL SONGS / PICKER] Activity transparan: InputMethodService tidak bisa menerima hasil pemilih berkas, jadi pemilih
 * dibuka dari sini lalu activity menutup dirinya sendiri. Dua mode (EXTRA_MODE):
 *   "add"    -> ACTION_OPEN_DOCUMENT (boleh banyak): berkas DISALIN ke folder lagu aplikasi (tetap bisa diputar walau berkas asli dipindah).
 *   "folder" -> ACTION_OPEN_DOCUMENT_TREE: izin baca folder disimpan tetap; lagu dimainkan di tempatnya.
 * Tidak ada izin penyimpanan di manifest: pemilih sistem (Storage Access Framework) yang memberi akses ke berkas pilihan saja.
 * Didaftarkan di manifest oleh native-patches/insert_activity.py (taskAffinity kosong supaya setelah selesai pengguna
 * kembali ke aplikasi yang sedang diketik).
 */
public class SongPickerActivity extends Activity {

    static final String EXTRA_MODE = "mode";
    private static final int REQ = 7401;
    private String mode = "add";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        String m = getIntent() != null ? getIntent().getStringExtra(EXTRA_MODE) : null;
        mode = "folder".equals(m) ? "folder" : "add";
        if (b != null) return;   // dibuat ulang oleh sistem: hasil pemilih (kalau ada) tiba di onActivityResult, jangan buka lagi
        Intent i;
        if ("folder".equals(mode)) {
            i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        } else {
            i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"audio/*", "application/ogg"});
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
        try { startActivityForResult(i, REQ); }
        catch (Throwable t) { SongPlayerBridge.notifyChanged("{\"added\":0,\"failed\":0,\"error\":\"no-picker\"}"); finish(); }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ || res != RESULT_OK || data == null) { finish(); return; }
        if ("folder".equals(mode)) { handleFolder(data.getData()); return; }

        final List<Uri> uris = new ArrayList<Uri>();
        ClipData cd = data.getClipData();
        if (cd != null) { for (int k = 0; k < cd.getItemCount() && k < 500; k++) { Uri u = cd.getItemAt(k).getUri(); if (u != null) uris.add(u); } }
        else if (data.getData() != null) uris.add(data.getData());
        if (uris.isEmpty()) { finish(); return; }

        Toast.makeText(this, "Menyalin " + uris.size() + " lagu…", Toast.LENGTH_SHORT).show();
        // Salin SELAGI activity hidup: izin baca sementara dari pemilih berlaku selama activity ini ada.
        SongPlayerBridge.IO.execute(new Runnable() {
            @Override public void run() {
                final int[] r = SongPlayerBridge.copyIn(getApplicationContext(), uris);
                SongPlayerBridge.notifyChanged("{\"added\":" + r[0] + ",\"failed\":" + r[1] + "}");
                runOnUiThread(new Runnable() { @Override public void run() { finish(); } });
            }
        });
    }

    private void handleFolder(final Uri tree) {
        if (tree == null) { finish(); return; }
        boolean ok = true;
        try {
            getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Set<String> s = SongPlayerBridge.trees(this);
            s.add(tree.toString());
            SongPlayerBridge.saveTrees(this, s);
        } catch (Throwable t) { ok = false; }
        SongPlayerBridge.notifyChanged("{\"folder\":true,\"added\":0,\"failed\":0" + (ok ? "" : ",\"error\":\"permission\"") + "}");
        finish();
    }
}
