// Periksa bahwa berkas Java di native-patches/ BISA DIKOMPILASI (sintaks/tipe/impor) terhadap stub Android di tools/java-stubs/.
//   node tools/java-check.js          (lokal: dilewati dengan pesan jelas kalau JDK tidak ada)
//   CI=true node tools/java-check.js  (di CI: JDK wajib ada, kalau tidak -> GAGAL)
// Berkas yang diperiksa: SongPlayerBridge, SongPickerActivity, LlamaBridge, HumRecorder.
// Tidak diperiksa di sini: HtmlKeyboardService + MainActivity (butuh stub Capacitor/InputMethodService yang besar) dan
// NativeMicPitchDetector (punya simulator sendiri: tools/sim/run.sh). Gradle di workflow build tetap penentu akhir.
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.join(__dirname, '..'), STUBS = path.join(__dirname, 'java-stubs'), PATCHES = path.join(ROOT, 'native-patches');
const TARGETS = ['SongPlayerBridge.java', 'SongPickerActivity.java', 'LlamaBridge.java', 'HumRecorder.java'];
const inCI = !!process.env.CI && process.env.CI !== 'false';
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.java') ? [path.join(d, e.name)] : []);

function findCompiler() {
  const tries = [['javac', []], [process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'javac') : 'javac-none', []], ['java', ['-m', 'jdk.compiler/com.sun.tools.javac.Main']]];
  for (const [bin, pre] of tries) { const r = cp.spawnSync(bin, pre.concat(['-version']), { encoding: 'utf8' }); if (r.status === 0) return { bin, pre }; }
  return null;
}
const comp = findCompiler();
if (!comp) {
  const m = 'JDK (javac) tidak ditemukan.';
  if (inCI) { console.log('GAGAL: ' + m + ' Di CI wajib ada (pasang actions/setup-java).'); process.exit(1); }
  console.log('lewati: ' + m + ' Pasang JDK 17 untuk menjalankan pemeriksaan kompilasi Java (di CI selalu dijalankan).'); process.exit(0);
}
const missing = TARGETS.filter(t => !fs.existsSync(path.join(PATCHES, t)));
if (missing.length) { console.log('GAGAL: berkas tidak ada: ' + missing.join(', ')); process.exit(1); }
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-javac-'));
const files = walk(STUBS).concat(TARGETS.map(t => path.join(PATCHES, t)));
const r = cp.spawnSync(comp.bin, comp.pre.concat(['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-serial', '-d', out], files), { encoding: 'utf8' });
fs.rmSync(out, { recursive: true, force: true });
const text = (r.stdout || '') + (r.stderr || '');
const warns = (text.match(/warning:/g) || []).length;
if (r.status !== 0) { console.log(text); console.log('GAGAL: kompilasi Java gagal (' + TARGETS.join(', ') + ')'); process.exit(1); }
if (warns) { console.log(text); console.log('GAGAL: ada ' + warns + ' peringatan kompilator (verifikasi dibuat bersih tanpa peringatan)'); process.exit(1); }
console.log('ok   : ' + TARGETS.length + ' berkas Java terkompilasi bersih terhadap stub Android (0 galat, 0 peringatan)');
console.log('\nSEMUA LULUS (kompilasi Java)');
