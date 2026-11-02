import sys

path = sys.argv[1]

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

if "SongPickerActivity" in content:
    print("SongPickerActivity sudah terdaftar, lewati.")
    sys.exit(0)

if "</application>" not in content:
    print("Tidak menemukan </application>, manifest tidak diubah.")
    sys.exit(1)

# taskAffinity kosong + NEW_TASK (dari service) = tugas sendiri; setelah selesai pengguna kembali ke aplikasi yang sedang
# diketik, bukan ke layar Guitarwiter. configChanges mencegah activity dibuat ulang (hasil pemilih tidak hilang) saat layar diputar.
block = """    <activity
        android:name=".SongPickerActivity"
        android:exported="false"
        android:taskAffinity=""
        android:excludeFromRecents="true"
        android:configChanges="orientation|screenSize|keyboardHidden|screenLayout|smallestScreenSize|uiMode"
        android:theme="@android:style/Theme.Translucent.NoTitleBar" />
</application>"""

content = content.replace("</application>", block, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("SongPickerActivity berhasil ditambahkan ke AndroidManifest.xml")
