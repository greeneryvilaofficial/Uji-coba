import sys

# Izin INTERNET untuk fitur opsional yang online (Lirik AI / Gemini). Template Capacitor biasanya sudah memuatnya;
# skrip ini hanya memastikan, supaya fitur tidak gagal diam-diam di build yang templatenya berbeda.
# Idempotent. Pemakaian: python3 native-patches/insert_internet.py android/app/src/main/AndroidManifest.xml

path = sys.argv[1]

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

if "android.permission.INTERNET" in content:
    print("Izin INTERNET sudah ada, lewati.")
    sys.exit(0)

if "<application" not in content:
    print("FATAL: tidak menemukan tag <application>, manifest tidak diubah.")
    sys.exit(1)

content = content.replace("<application", '<uses-permission android:name="android.permission.INTERNET" />\n    <application', 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Izin INTERNET berhasil ditambahkan ke AndroidManifest.xml")
