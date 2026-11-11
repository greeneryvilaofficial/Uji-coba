#!/bin/bash
# Simulator DETERMINISTIK (jam virtual): hasil sama persis tiap dijalankan, jauh lebih cepat dari real-time.
# Pakai:  tools/vsim/run.sh [cost=<ms>] <skenario...>        (butuh JDK 17+)
#   cost=<ms>  biaya virtual per bacaan YIN, meniru HP lambat (mis. cost=8). Bawaan 0.
#   DET=<file.java>  bandingkan detektor lain (mis. versi lama) tanpa menyentuh native-patches/.
# Skenario: sama dengan tools/sim/run.sh, ditambah:  rep <gap_dtk> <midi> <amp>   (nada SAMA diulang 6x)
here="$(cd "$(dirname "$0")" && pwd)"; root="$here/../.."
cost=0; args=(); for a in "$@"; do case "$a" in cost=*) cost=${a#cost=};; *) args+=("$a");; esac; done
DET=${DET:-$root/native-patches/NativeMicPitchDetector.java}
JAVAC=${JAVA_HOME:+$JAVA_HOME/bin/}javac; JAVA=${JAVA_HOME:+$JAVA_HOME/bin/}java
if ! command -v "$JAVAC" >/dev/null 2>&1; then JAVAC="$JAVA -m jdk.compiler/com.sun.tools.javac.Main"; fi
d=$(mktemp -d); mkdir -p $d/src/com/keyboardkustom/app
cp -r "$here/android" "$here/androidx" "$here/Harness.java" $d/src/
cp "$DET" $d/src/com/keyboardkustom/app/NativeMicPitchDetector.java
python3 - $d/src/com/keyboardkustom/app/NativeMicPitchDetector.java <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
a="return System.nanoTime() / 1_000_000L;"; assert s.count(a)==1; s=s.replace(a,"return android.os.VClock.ms();")
b="    private PitchReading yinDetect(float[] buf, int size, int sampleRate) {\n"; assert s.count(b)==1
s=s.replace(b,b+"        android.os.VClock.advance(android.os.VClock.cost);\n"); open(p,'w',encoding='utf-8').write(s)
PY
$JAVAC -encoding UTF-8 -d $d/out $(find $d/src -name '*.java') && $JAVA -Dcost=$cost ${PER:+-Dper=1} ${SEED:+-Dseed=$SEED} ${RESF:+-Dresf=$RESF} -cp $d/out Harness "${args[@]}"
rm -rf $d
