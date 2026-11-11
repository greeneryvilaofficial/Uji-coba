/* ============================================================================================
 * [LABEL GWTR / ROUTER] src/lib/router.js
 * GWTR.translate(text, from, to, { engine })   engine: 'auto' | 'llama' | 'dict' | 'gemini'
 *   auto   = Llama offline bila siap, kalau tidak kamus offline. TIDAK PERNAH memakai online secara otomatis.
 *   gemini = online (Google Gemini), hanya bila dipilih eksplisit DAN sudah dinyalakan + ada kunci (lihat online/gemini.js).
 * Hasil selalu memuat `engine` yang BENAR-BENAR dipakai, dan `fellBack:true` bila auto jatuh ke kamus.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var NS = root.GWTR;
  if (!NS || !NS.core || NS.translate) return;
  var C = NS.core;
  function translate(text, from, to, opts) {
    var engine = (opts && opts.engine) || 'auto';
    if (engine === 'dict') return Promise.resolve(NS.dict ? NS.dict.translate(text, from, to) : C.fail('module-missing', 'dict'));
    if (engine === 'gemini') return NS.gemini ? NS.gemini.translate(text, from, to) : Promise.resolve(C.fail('module-missing', 'gemini'));
    if (engine === 'llama') return NS.llama ? NS.llama.translate(text, from, to, opts) : Promise.resolve(C.fail('module-missing', 'llama'));
    if (engine !== 'auto') return Promise.resolve(C.fail('bad-engine'));
    if (NS.llama && NS.llama.status().available) {
      return NS.llama.translate(text, from, to, opts).then(function (r) { return r.ok || !NS.dict ? r : fallback(r); });
    }
    return Promise.resolve(fallback(null));
    function fallback(prev) { var d = NS.dict.translate(text, from, to); if (d.ok) { d.fellBack = true; if (prev) d.llamaError = prev.error; } return d; }
  }
  NS.translate = translate;
})(typeof window !== 'undefined' ? window : globalThis);
