'use strict';

/*
 * Minhwa Style — Traditional Korean painting aesthetic for avatars
 *
 * Injects SVG filter defs into the DOM. CSS applies those filters to
 * all avatar containers via `filter: url(#minhwa)`.
 *
 * Filter chain:
 *  1. feColorMatrix  — earthy pigments: desaturate, warm, lift blacks to nanquim ink
 *  2. feTurbulence + feDisplacementMap — organic brush-stroke wobble
 *  3. feGaussianBlur — watercolor soft bloom at stroke edges
 *  4. Barim (inner shadow) — watercolor depth: dark wash from silhouette edges inward
 */

(function () {
  /* SVG filter defs — injected once into document body */
  const DEFS_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"
     style="position:absolute;pointer-events:none;overflow:hidden">
  <defs>

    <!--
      #minhwa — main avatar filter
      Color math (feColorMatrix):
        Black (#000) → nanquim ink (#1a1208): lifted by intercepts [0.102, 0.071, 0.031]
        White (#fff) → warm hanji [~1.0, 0.95, 0.83] (clamped, slight ochre warmth)
        Vibrant hues → earthy/muted: reduced saturation, warmth bias, blue suppression
    -->
    <filter id="minhwa" x="-5%" y="-5%" width="110%" height="110%"
            color-interpolation-filters="sRGB">

      <!-- 1. Earthy pigment color matrix -->
      <feColorMatrix type="matrix"
        values="0.78 0.14 0.04 0 0.102
                0.04 0.80 0.04 0 0.071
                0.02 0.06 0.72 0 0.031
                0    0    0    1 0"
        result="earthy"/>

      <!-- 2. Brush stroke organic displacement -->
      <feTurbulence type="fractalNoise" baseFrequency="0.04 0.065"
        numOctaves="2" seed="7" stitchTiles="stitch" result="noise"/>
      <feDisplacementMap in="earthy" in2="noise" scale="2.2"
        xChannelSelector="R" yChannelSelector="G" result="displaced"/>

      <!-- 3. Watercolor bloom: soft diffusion at stroke edges -->
      <feGaussianBlur in="displaced" stdDeviation="0.45" result="soft"/>
      <feComposite in="soft" in2="SourceGraphic" operator="in" result="painted"/>

      <!--
        4. Barim: dark wash seeps inward from silhouette edges
           Technique: invert alpha → blur inward → color with ink → clip to shape
      -->
      <feFlood flood-color="white" result="bgFlood"/>
      <feComposite in="bgFlood" in2="SourceAlpha" operator="out" result="invertedMask"/>
      <feGaussianBlur in="invertedMask" stdDeviation="6" result="edgeMask"/>
      <feFlood flood-color="#2a1005" flood-opacity="0.28" result="inkFlood"/>
      <feComposite in="inkFlood" in2="edgeMask" operator="in" result="barim"/>
      <feComposite in="barim" in2="SourceAlpha" operator="in" result="clippedBarim"/>

      <!-- 5. Composite: painted base + barim inner shadow -->
      <feMerge>
        <feMergeNode in="painted"/>
        <feMergeNode in="clippedBarim"/>
      </feMerge>
    </filter>

  </defs>
</svg>`;

  function inject() {
    if (document.getElementById('minhwa-defs')) return;
    const host = document.createElement('div');
    host.id = 'minhwa-defs';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    host.innerHTML = DEFS_SVG;
    document.body.insertBefore(host, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
