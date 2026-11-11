// Pemeriksa KEBERSIHAN repo + pipeline build Android. Jalan di `npm test` (CI "Verify") dan, dengan --built, di workflow build.
//   node tools/ci-check.js                      pemeriksaan statis + simulasi seluruh urutan patch pada proyek Android TIRUAN
//   node tools/ci-check.js --built android      memeriksa proyek Android ASLI setelah semua patch (dipanggil sebelum Gradle: gagal cepat, pesan jelas)
// Tanpa dependensi (Node >= 18; python3 dipakai untuk skrip patch & memeriksa XML, sudah ada di runner GitHub).
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.join(__dirname, '..'), rd = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8'), ex = (...p) => fs.existsSync(path.join(ROOT, ...p));
let fail = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { fail++; console.log('GAGAL:', m); } else console.log('ok   :', m); };
const skip = m => console.log('lewati:', m);
const py = (args, opt) => cp.spawnSync('python3', args, Object.assign({ encoding: 'utf8', cwd: ROOT }, opt || {}));
const PKG = JSON.parse(rd('package.json'));
const PKG_NAME = 'com.keyboardkustom.app', JAVA_DIR = ['app', 'src', 'main', 'java', 'com', 'keyboardkustom', 'app'];
const walkFiles = (d, base = d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walkFiles(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name)).split(path.sep).join('/')]);

// ============================================================ pemeriksaan proyek Android hasil patch
function builtChecks(dir, label) {
  const A = (...p) => path.join(dir, ...p), has = (...p) => fs.existsSync(A(...p)), txt = (...p) => (has(...p) ? fs.readFileSync(A(...p), 'utf8') : '');
  const man = txt('app', 'src', 'main', 'AndroidManifest.xml'), L = m => label + ': ' + m;
  ok(man.length > 0, L('AndroidManifest.xml ada'));
  const xml = py(['-c', 'import sys,xml.etree.ElementTree as E; E.parse(sys.argv[1])', A('app', 'src', 'main', 'AndroidManifest.xml')]);
  ok(xml.status === 0, L('AndroidManifest.xml adalah XML yang valid' + (xml.status ? ' -> ' + (xml.stderr || '').trim().split('\n').pop() : '')));
  const count = re => (man.match(re) || []).length;
  ok(count(/android:name="\.HtmlKeyboardService"/g) === 1 && /android\.permission\.BIND_INPUT_METHOD/.test(man) && /android\.view\.InputMethod/.test(man), L('service keyboard terdaftar tepat sekali (BIND_INPUT_METHOD + intent InputMethod)'));
  ok(count(/android:name="\.SongPickerActivity"/g) === 1 && /SongPickerActivity"[^>]*android:exported="false"/.test(man.replace(/\n/g, ' ')) && /taskAffinity=""/.test(man), L('SongPickerActivity terdaftar sekali, exported=false, taskAffinity kosong'));
  ok(count(/android\.permission\.RECORD_AUDIO/g) === 1, L('izin RECORD_AUDIO tepat sekali (deteksi nada gitar)'));
  ok(count(/android\.permission\.INTERNET/g) === 1, L('izin INTERNET tepat sekali (dibutuhkan fitur online opsional: Lirik AI/Gemini; tanpa ini gagal diam-diam)'));
  ok(!/READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/.test(man), L('tidak ada izin penyimpanan luas (pemutar lagu memakai folder aplikasi + pemilih sistem)'));
  const jd = A(...JAVA_DIR), javaFiles = fs.readdirSync(path.join(ROOT, 'native-patches')).filter(f => f.endsWith('.java')), bad = javaFiles.filter(f => !fs.existsSync(path.join(jd, f)) || fs.readFileSync(path.join(jd, f), 'utf8') !== rd('native-patches', f));
  ok(javaFiles.length >= 7 && bad.length === 0, L(javaFiles.length + ' berkas Java dari native-patches/ tertempel & identik di ' + JAVA_DIR.join('/') + (bad.length ? ' -> KURANG/BEDA: ' + bad.join(', ') : '')));
  ok(has('app', 'src', 'main', 'res', 'xml', 'method.xml'), L('res/xml/method.xml (definisi keyboard) ada'));
  const st = txt('app', 'src', 'main', 'res', 'values', 'strings.xml'); ok(!st || /<string name="app_name">Guitarwiter<\/string>/.test(st), L('nama aplikasi di launcher = Guitarwiter'));
  const gr = txt('app', 'build.gradle'), vm = PKG.version.match(/^(\d+)\.(\d+)\.(\d+)$/), code = vm ? (+vm[1]) * 10000 + (+vm[2]) * 100 + (+vm[3]) : -1;
  ok(/androidx\.webkit:webkit/.test(gr), L('build.gradle: dependency androidx.webkit'));
  ok(gr.includes('versionName "' + PKG.version + '"') && new RegExp('versionCode\\s+' + code + '\\b').test(gr), L('build.gradle: versionName ' + PKG.version + ' / versionCode ' + code + ' sama dengan package.json'));
  ok(/GUITARWITER_PERF/.test(gr) && /debuggable false/.test(gr), L('build.gradle: build debug non-debuggable (deteksi nada secepat release)'));
  ok(has('app', 'src', 'main', 'res', 'mipmap-hdpi', 'ic_launcher.png'), L('ikon launcher terpasang (mipmap-hdpi/ic_launcher.png)'));
  // semua berkas www/ benar-benar ikut dikemas Capacitor (assets/public) dengan isi yang sama
  const pub = A('app', 'src', 'main', 'assets', 'public'), www = path.join(ROOT, 'www');
  ok(fs.existsSync(pub), L('assets/public ada (hasil cap sync)'));
  if (fs.existsSync(pub)) {
    const miss = walkFiles(www).filter(f => !fs.existsSync(path.join(pub, f)) || fs.statSync(path.join(pub, f)).size !== fs.statSync(path.join(www, f)).size);
    ok(miss.length === 0, L('semua ' + walkFiles(www).length + ' berkas www/ (index, ai/, lib/, player/, sw.js …) ikut di APK dan ukurannya sama' + (miss.length ? ' -> KURANG/BEDA: ' + miss.slice(0, 8).join(', ') : '')));
  }
}

// ============================================================ mode --built: proyek Android asli, lalu selesai
const bi = process.argv.indexOf('--built');
if (bi >= 0) {
  const dir = process.argv[bi + 1] || 'android';
  if (!fs.existsSync(dir)) { console.log('GAGAL: folder ' + dir + ' tidak ada'); process.exit(1); }
  builtChecks(path.resolve(dir), 'APK');
  console.log(fail ? '\n' + fail + ' dari ' + total + ' GAGAL (hentikan build di sini, lebih cepat daripada menunggu Gradle)' : '\nSEMUA LULUS (' + total + ' pemeriksaan proyek Android)');
  process.exit(fail ? 1 : 0);
}

// ============================================================ 1. workflow
const wfDirs = ['.github/workflows', 'workflows'], wfs = wfDirs.map(d => fs.readdirSync(path.join(ROOT, d)).filter(f => /\.ya?ml$/.test(f)).sort());
ok(wfs[0].join() === wfs[1].join() && wfs[0].every(f => rd(wfDirs[0], f) === rd(wfDirs[1], f)), 'workflows/ dan .github/workflows/ identik (' + wfs[0].join(', ') + ')');
{ const files = wfs[0].map(f => path.join(ROOT, wfDirs[0], f)), r = py(['-c', 'import sys,yaml\nfor f in sys.argv[1:]: yaml.safe_load(open(f,encoding="utf-8"))'].concat(files));
  if (r.status === 0) ok(true, 'semua workflow adalah YAML yang valid'); else if (/No module named/.test(r.stderr || '')) skip('PyYAML tidak terpasang; validasi YAML dilewati (di runner GitHub tersedia)'); else ok(false, 'YAML tidak valid: ' + (r.stderr || '').trim().split('\n').slice(-2).join(' / ')); }
const BUILD = rd('.github/workflows/android-build.yml'), VERIFY = rd('.github/workflows/verify.yml');
const refs = [...new Set([...BUILD.matchAll(/native-patches\/([A-Za-z0-9_.-]+)/g)].map(m => m[1]))].filter(f => f !== 'app-icon');   // app-icon: cadangan jalur ikon, diperiksa terpisah
ok(refs.length >= 15 && refs.every(f => ex('native-patches', f)), 'setiap native-patches/<berkas> yang dirujuk android-build.yml ADA (' + refs.length + ' rujukan' + (refs.filter(f => !ex('native-patches', f)).length ? '; HILANG: ' + refs.filter(f => !ex('native-patches', f)) : '') + ')');
const unref = fs.readdirSync(path.join(ROOT, 'native-patches')).filter(f => !refs.includes(f));
ok(unref.length === 0, 'setiap berkas di native-patches/ dipakai workflow build (tidak ada yang terlupa' + (unref.length ? '; TIDAK DIPAKAI: ' + unref.join(', ') : '') + ')');
ok(ex('app-icon', 'mipmap-hdpi') && /app-icon/.test(BUILD) && !/python3 native-patches\/insert_icon\.py[^\n]*native-patches\/app-icon\s*$/m.test(BUILD), 'folder ikon: app-icon/ ada di akar repo dan workflow memakainya (bukan native-patches/app-icon yang tidak ada)');
ok(!/^\s*cache:\s*(npm|gradle)\s*$/m.test(BUILD + VERIFY) || ex('package-lock.json'), 'workflow tidak memakai cache npm/gradle tanpa package-lock.json (setup-node/java akan gagal: "lock file not found")');
ok(/npm test/.test(VERIFY) && /java-check/.test(VERIFY), 'Verify menjalankan npm test + pemeriksaan kompilasi Java');
ok(/ci-check\.js --built/.test(BUILD) && /npm test/.test(BUILD) && BUILD.indexOf('npm test') < BUILD.indexOf('assembleDebug'), 'build: tes dijalankan SEBELUM Gradle, dan hasil patch diperiksa sebelum Gradle');
ok(/if:[^\n]*github\.event_name (==|!=) '(push|pull_request)'/.test(BUILD) || !/^\s*pull_request:/m.test(BUILD), 'Release hanya dibuat pada push (bukan pull request)');
ok(/timeout-minutes:/.test(BUILD) && /concurrency:/.test(BUILD), 'build punya timeout dan concurrency (tidak menggantung / tidak dobel)');
for (const f of wfs[0]) { const t = rd(wfDirs[0], f); ok(!/AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{36}/.test(t), f + ': tidak ada rahasia tertulis (hanya ${{ secrets.* }})'); }

// ============================================================ 2. versi & berkas yang harus ikut
const coreV = (rd('src/lib/core.js').match(/NS\.version = '([^']+)'/) || [])[1], readmeV = (rd('README.md').match(/^### v(\d+\.\d+\.\d+)/m) || [])[1];
ok(/^\d+\.\d+\.\d+$/.test(PKG.version) && coreV === PKG.version && readmeV === PKG.version, 'versi seragam: package.json ' + PKG.version + ' = lib/core.js ' + coreV + ' = changelog README teratas ' + readmeV);
ok(rd('privacy-policy.md').includes('v' + PKG.version) && rd('www/sw.js').includes('v' + PKG.version), 'kebijakan privasi dan sw.js menyebut v' + PKG.version);
const sw = rd('www/sw.js'), core = (sw.match(/CORE_ASSETS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '', listed = [...core.matchAll(/'([^']+)'/g)].map(m => m[1]);
const gone = listed.filter(f => f !== './' && f !== '/' && !ex('www', f.replace(/^\.\//, '')));
ok(listed.length > 10 && gone.length === 0, 'sw.js: semua ' + listed.length + ' aset yang dicache ADA di www/' + (gone.length ? ' -> HILANG: ' + gone : ''));
const jsInWww = ['ai', 'lib', 'player'].flatMap(d => walkFiles(path.join(ROOT, 'www', d)).map(f => d + '/' + f)).filter(f => f.endsWith('.js')), notCached = jsInWww.filter(f => !listed.includes(f));
ok(notCached.length === 0, 'setiap skrip di www/ai, www/lib, www/player ada di cache sw.js (offline lengkap)' + (notCached.length ? ' -> BELUM: ' + notCached : ''));
const html = rd('www/index.html'), mods = [...html.matchAll(/'((?:ai|lib|player)\/[A-Za-z0-9_\/.-]+\.js)'/g)].map(m => m[1]), noMod = [...new Set(mods)].filter(f => !ex('www', f));
ok(mods.length >= 20 && noMod.length === 0, 'index.html: semua ' + new Set(mods).size + ' modul yang dimuat (ai/, lib/, player/) ada berkasnya' + (noMod.length ? ' -> HILANG: ' + noMod : ''));
ok(ex('.gitignore') && /node_modules\//.test(rd('.gitignore')) && /\*\.keystore/.test(rd('.gitignore')) && /^android\/$/m.test(rd('.gitignore')), '.gitignore menutup node_modules/, android/, keystore');

// ============================================================ 3. rahasia & Java
const skipDir = new Set(['node_modules', '.git', 'android']), SECRET = /AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{32,}|xox[bp]-[0-9A-Za-z-]{20,}/;
const textFiles = walkFiles(ROOT).filter(f => !f.split('/').some(s => skipDir.has(s)) && /\.(js|json|md|html|java|py|xml|yml|yaml|txt|gradle|sh)$/.test(f)), leaks = textFiles.filter(f => SECRET.test(rd(...f.split('/'))));
ok(leaks.length === 0, 'tidak ada kunci/rahasia tertulis di ' + textFiles.length + ' berkas teks' + (leaks.length ? ' -> ' + leaks : ''));
ok(!walkFiles(ROOT).some(f => !f.startsWith('node_modules/') && /\.(keystore|jks|p12|gguf|apk|aab)$/.test(f)), 'tidak ada keystore/model/APK ikut di repo');
const javas = fs.readdirSync(path.join(ROOT, 'native-patches')).filter(f => f.endsWith('.java'));
ok(javas.every(f => { const s = rd('native-patches', f); return s.includes('package ' + PKG_NAME + ';') && new RegExp('(class|interface) ' + f.replace('.java', '') + '\\b').test(s); }), 'semua ' + javas.length + ' berkas Java: package ' + PKG_NAME + ' dan nama kelas = nama berkas');
const pyc = py(['-m', 'py_compile'].concat(fs.readdirSync(path.join(ROOT, 'native-patches')).filter(f => f.endsWith('.py')).map(f => 'native-patches/' + f)));
ok(pyc.status === 0, 'semua skrip patch Python lolos kompilasi sintaks' + (pyc.status ? ': ' + (pyc.stderr || '').trim().split('\n').pop() : ''));
for (const d of ['native-patches/__pycache__']) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true });

// ============================================================ 4. simulasi SELURUH urutan patch pada proyek Android tiruan (bentuk template Capacitor 6)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-android-')), AD = path.join(tmp, 'android'), main = path.join(AD, 'app', 'src', 'main');
fs.mkdirSync(path.join(main, 'res', 'values'), { recursive: true }); fs.mkdirSync(path.join(AD, ...JAVA_DIR), { recursive: true });
fs.writeFileSync(path.join(main, 'AndroidManifest.xml'), `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/AppTheme">

        <activity android:name=".MainActivity" android:exported="true" />

    </application>

    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
`);
fs.writeFileSync(path.join(main, 'res', 'values', 'strings.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">Template</string>\n    <string name="title_activity_main">Template</string>\n</resources>\n');
fs.writeFileSync(path.join(AD, 'app', 'build.gradle'), `apply plugin: 'com.android.application'

android {
    namespace "${PKG_NAME}"
    compileSdk rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "${PKG_NAME}"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
}
`);
const mani = path.join(main, 'AndroidManifest.xml'), grad = path.join(AD, 'app', 'build.gradle');
const steps = [['insert_icon.py', [path.join(main, 'res'), path.join(ROOT, 'app-icon')]], ['insert_service.py', [mani]], ['insert_activity.py', [mani]], ['insert_permission.py', [mani]], ['insert_internet.py', [mani]],
  ['insert_webkit_dependency.py', [grad]], ['insert_perf.py', [grad]], ['insert_version.py', [grad, path.join(ROOT, 'package.json')]], ['insert_signing.py', [grad]]];
const snap = () => [mani, grad, path.join(main, 'res', 'values', 'ic_launcher_background.xml')].map(f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')).join('\u0001');
let allRan = true, idem = true, firstFail = '';
for (const [s, a] of steps) { const r1 = py(['native-patches/' + s].concat(a)); if (r1.status !== 0) { allRan = false; firstFail = firstFail || s + ': ' + (r1.stdout + r1.stderr).trim().split('\n').pop(); } }
const after1 = snap();
for (const [s, a] of steps) { const r2 = py(['native-patches/' + s].concat(a)); if (r2.status !== 0) { idem = false; firstFail = firstFail || s + ' (kali ke-2): ' + (r2.stdout + r2.stderr).trim().split('\n').pop(); } }
ok(allRan, 'simulasi: semua ' + steps.length + ' skrip patch berjalan sukses pada proyek tiruan' + (allRan ? '' : ' -> ' + firstFail));
ok(idem && snap() === after1, 'simulasi: menjalankan semua patch kedua kali tidak mengubah apa pun (idempotent, tidak ada entri ganda)');
// meniru langkah workflow yang lain: tempel Java, method.xml, nama aplikasi, salin www -> assets/public
for (const f of fs.readdirSync(path.join(ROOT, 'native-patches')).filter(f => f.endsWith('.java'))) fs.copyFileSync(path.join(ROOT, 'native-patches', f), path.join(AD, ...JAVA_DIR, f));
fs.mkdirSync(path.join(main, 'res', 'xml'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'native-patches', 'method.xml'), path.join(main, 'res', 'xml', 'method.xml'));
fs.writeFileSync(path.join(main, 'res', 'values', 'strings.xml'), fs.readFileSync(path.join(main, 'res', 'values', 'strings.xml'), 'utf8').replace(/Template/g, 'Guitarwiter'));
const pubDir = path.join(main, 'assets', 'public'); for (const f of walkFiles(path.join(ROOT, 'www'))) { fs.mkdirSync(path.dirname(path.join(pubDir, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'www', f), path.join(pubDir, f)); }
const before = fail; builtChecks(AD, 'simulasi'); ok(fail === before, 'simulasi: pemeriksa proyek Android LULUS pada hasil patch yang benar');
// pemeriksa harus BISA gagal: rusakkan satu per satu
const brk = (name, fn, msg) => { const bak = new Map(), save = f => { if (!bak.has(f)) bak.set(f, fs.readFileSync(f)); }; fn(save); const b = fail, t = total, log = console.log; console.log = () => {}; builtChecks(AD, 'rusak'); console.log = log; const failed = fail - b; fail = b; total = t; for (const [f, buf] of bak) fs.writeFileSync(f, buf); ok(failed > 0, 'pemeriksa mendeteksi: ' + msg); };
brk('internet', save => { save(mani); fs.writeFileSync(mani, fs.readFileSync(mani, 'utf8').replace(/<uses-permission android:name="android\.permission\.INTERNET" \/>/g, '')); }, 'izin INTERNET hilang');
brk('java', save => { const f = path.join(AD, ...JAVA_DIR, 'SongPlayerBridge.java'); save(f); fs.writeFileSync(f, '// rusak'); }, 'berkas Java tidak identik / terlupa');
brk('www', save => { const f = path.join(pubDir, 'player', 'songplayer.js'); save(f); fs.rmSync(f); fs.writeFileSync(f, 'x'); }, 'berkas www/ tidak ikut di APK / ukuran beda');
brk('manifest', save => { save(mani); fs.writeFileSync(mani, fs.readFileSync(mani, 'utf8') + '<oops'); }, 'AndroidManifest.xml rusak (bukan XML valid)');
brk('storage', save => { save(mani); fs.writeFileSync(mani, fs.readFileSync(mani, 'utf8').replace('<application', '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />\n<application')); }, 'izin penyimpanan luas terselip');
fs.rmSync(tmp, { recursive: true, force: true });

console.log(fail ? '\n' + fail + ' dari ' + total + ' GAGAL' : '\nSEMUA LULUS (' + total + ' pemeriksaan kebersihan repo & pipeline Android)');
process.exit(fail ? 1 : 0);
