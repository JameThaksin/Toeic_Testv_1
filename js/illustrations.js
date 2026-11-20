/*
 * Hand-drawn SVG illustrations for the picture-based items (Part 1 Photographs, Speaking "describe a picture").
 * Each one is drawn for its own question, so the picture matches exactly one statement.
 */
(function (root) {
  'use strict';
  const skin = '#f1c7a5', skin2 = '#c98e6a', hairDark = '#2f2320';

  const PHOTO_TYPING = `
<svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg">
  <rect width="640" height="400" fill="#dfe7f2"/>
  <rect y="322" width="640" height="78" fill="#c7b496"/>
  <rect y="318" width="640" height="6" fill="#b09b7a"/>
  <!-- window -->
  <rect x="48" y="40" width="160" height="120" rx="6" fill="#bfe3ff" stroke="#93a8c2" stroke-width="6"/>
  <line x1="128" y1="40" x2="128" y2="160" stroke="#93a8c2" stroke-width="5"/>
  <line x1="48" y1="100" x2="208" y2="100" stroke="#93a8c2" stroke-width="5"/>
  <path d="M60 150 q30 -40 60 -10 q20 -25 40 0 q20 -20 40 5 v5 h-140z" fill="#9fd0a7" opacity=".8"/>
  <!-- framed picture already on the wall -->
  <rect x="452" y="54" width="120" height="84" rx="4" fill="#fff" stroke="#6b5a45" stroke-width="7"/>
  <path d="M464 128 l30 -38 l22 26 l14 -14 l30 26z" fill="#7fb4e8"/>
  <circle cx="548" cy="80" r="9" fill="#f6c453"/>
  <!-- desk -->
  <rect x="300" y="232" width="300" height="14" rx="3" fill="#8b5e3c"/>
  <rect x="314" y="246" width="12" height="76" fill="#6f4a2f"/>
  <rect x="574" y="246" width="12" height="76" fill="#6f4a2f"/>
  <!-- chair -->
  <rect x="200" y="150" width="14" height="118" rx="6" fill="#34495e"/>
  <rect x="204" y="256" width="98" height="14" rx="6" fill="#34495e"/>
  <rect x="246" y="270" width="10" height="44" fill="#2c3e50"/>
  <rect x="216" y="312" width="72" height="8" rx="4" fill="#2c3e50"/>
  <!-- legs -->
  <rect x="240" y="238" width="104" height="24" rx="11" fill="#2f3b55"/>
  <rect x="326" y="240" width="20" height="78" rx="8" fill="#2f3b55"/>
  <ellipse cx="346" cy="318" rx="20" ry="7" fill="#1f2433"/>
  <!-- torso -->
  <rect x="222" y="150" width="62" height="104" rx="24" fill="#4f7cff"/>
  <!-- hair (back) -->
  <path d="M232 128 q-6 50 10 70 h40 q8 -30 4 -70z" fill="${hairDark}"/>
  <!-- head -->
  <circle cx="262" cy="118" r="26" fill="${skin}"/>
  <path d="M236 116 q4 -34 34 -32 q24 2 22 30 q-14 -14 -40 -10 q-8 4 -16 12z" fill="${hairDark}"/>
  <circle cx="276" cy="120" r="3" fill="#2b2b2b"/>
  <path d="M280 132 q-5 4 -10 2" stroke="#9b5a44" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <!-- arm reaching to the keyboard -->
  <path d="M268 170 L318 214 L380 224" stroke="#4f7cff" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="388" cy="225" r="9" fill="${skin}"/>
  <circle cx="404" cy="225" r="8" fill="${skin2}"/>
  <!-- laptop: base + open screen -->
  <rect x="370" y="226" width="110" height="7" rx="2" fill="#a3acbd"/>
  <polygon points="474,228 498,150 508,152 484,230" fill="#3b4252"/>
  <polygon points="478,222 499,156 504,157 483,223" fill="#7fb4e8"/>
  <!-- coffee mug on the desk (not being poured) -->
  <rect x="532" y="204" width="26" height="28" rx="4" fill="#e45b5b"/>
  <path d="M558 210 q12 2 10 12 q-2 8 -10 6" stroke="#e45b5b" stroke-width="5" fill="none"/>
  <path d="M540 196 q-6 -8 0 -16 M550 196 q-6 -8 0 -16" stroke="#a0aab8" stroke-width="3" fill="none" stroke-linecap="round"/>
  <!-- plant -->
  <path d="M600 300 q-20 -40 -6 -70 M600 300 q8 -50 26 -62 M600 300 q-34 -18 -40 -46" stroke="#4c9a5b" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M584 296 h34 l-6 30 h-22z" fill="#c26b3c"/>
</svg>`;

  const PHOTO_PRESENTATION = `
<svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg">
  <rect width="640" height="400" fill="#e5e9f1"/>
  <rect y="336" width="640" height="64" fill="#9aa4b5"/>
  <!-- projection screen with bar chart -->
  <rect x="372" y="34" width="244" height="160" rx="4" fill="#ffffff" stroke="#59627a" stroke-width="5"/>
  <line x1="398" y1="170" x2="596" y2="170" stroke="#59627a" stroke-width="3"/>
  <line x1="398" y1="60" x2="398" y2="170" stroke="#59627a" stroke-width="3"/>
  <rect x="414" y="132" width="28" height="38" fill="#7b8cff"/>
  <rect x="456" y="112" width="28" height="58" fill="#7b8cff"/>
  <rect x="498" y="92" width="28" height="78" fill="#7b8cff"/>
  <rect x="540" y="66" width="28" height="104" fill="#44d39a"/>
  <!-- light beam from the projector (it is ON) -->
  <polygon points="252,258 372,60 372,190" fill="#fff6c8" opacity=".45"/>
  <!-- presenter standing, pointing at the chart -->
  <rect x="318" y="250" width="16" height="84" rx="7" fill="#26324d"/>
  <rect x="338" y="250" width="16" height="84" rx="7" fill="#26324d"/>
  <ellipse cx="326" cy="336" rx="14" ry="6" fill="#151a26"/>
  <ellipse cx="350" cy="336" rx="14" ry="6" fill="#151a26"/>
  <rect x="308" y="148" width="56" height="112" rx="20" fill="#2d3a5a"/>
  <polygon points="330,150 342,150 336,186" fill="#ffffff"/>
  <polygon points="333,156 339,156 336,180" fill="#e45b5b"/>
  <path d="M352 166 L392 132 L426 108" stroke="#2d3a5a" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="432" cy="104" r="8" fill="${skin}"/>
  <line x1="436" y1="100" x2="446" y2="92" stroke="${skin}" stroke-width="5" stroke-linecap="round"/>
  <path d="M318 172 L312 226" stroke="#2d3a5a" stroke-width="15" fill="none" stroke-linecap="round"/>
  <circle cx="336" cy="120" r="24" fill="${skin}"/>
  <path d="M312 116 q2 -28 26 -28 q24 2 22 26 q-12 -10 -26 -8 q-12 2 -22 10z" fill="#3d2b1f"/>
  <circle cx="348" cy="120" r="3" fill="#2b2b2b"/>
  <!-- meeting table -->
  <rect x="24" y="262" width="270" height="14" rx="3" fill="#7a5a3f"/>
  <rect x="40" y="276" width="12" height="60" fill="#5e432e"/>
  <rect x="264" y="276" width="12" height="60" fill="#5e432e"/>
  <!-- projector on the table -->
  <rect x="222" y="240" width="50" height="22" rx="5" fill="#3a3f4b"/>
  <circle cx="266" cy="251" r="7" fill="#fff6c8" stroke="#1d2029" stroke-width="3"/>
  <!-- seated audience (facing the screen) -->
  <g>
    <rect x="44" y="196" width="44" height="66" rx="16" fill="#8e5bd8"/>
    <circle cx="68" cy="176" r="19" fill="${skin2}"/>
    <path d="M50 174 q2 -22 20 -22 q18 2 17 20 q-10 -8 -20 -6 q-10 2 -17 8z" fill="#1d1d1d"/>
    <rect x="34" y="230" width="10" height="46" rx="4" fill="#4a4f60"/>
  </g>
  <g>
    <path d="M112 168 q-8 46 6 64 h36 q8 -30 2 -64z" fill="#5a3a22"/>
    <rect x="110" y="196" width="44" height="66" rx="16" fill="#e98b4f"/>
    <circle cx="134" cy="176" r="19" fill="${skin}"/>
    <path d="M114 176 q2 -26 22 -24 q18 2 17 22 q-12 -8 -22 -6 q-10 2 -17 8z" fill="#5a3a22"/>
    <rect x="100" y="230" width="10" height="46" rx="4" fill="#4a4f60"/>
  </g>
  <g>
    <rect x="176" y="196" width="44" height="66" rx="16" fill="#3fa58c"/>
    <circle cx="200" cy="176" r="19" fill="${skin}"/>
    <path d="M182 172 q4 -22 20 -20 q16 2 16 18 q-8 -6 -18 -4 q-10 2 -18 6z" fill="#7a7a7a"/>
    <rect x="166" y="230" width="10" height="46" rx="4" fill="#4a4f60"/>
  </g>
  <rect x="88" y="252" width="34" height="10" rx="2" fill="#ffffff"/>
  <rect x="150" y="254" width="26" height="8" rx="2" fill="#dfe6f5"/>
</svg>`;

  const SCENE_OFFICE = `
<svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg">
  <rect width="640" height="400" fill="#e9edf4"/>
  <rect y="330" width="640" height="70" fill="#b7c0cf"/>
  <!-- window with city view (background) -->
  <rect x="236" y="26" width="168" height="96" rx="4" fill="#cfe7ff" stroke="#9aa7bc" stroke-width="5"/>
  <rect x="252" y="66" width="22" height="56" fill="#a9bdd6"/><rect x="282" y="52" width="26" height="70" fill="#98aecb"/>
  <rect x="316" y="74" width="20" height="48" fill="#a9bdd6"/><rect x="344" y="58" width="28" height="64" fill="#98aecb"/>
  <!-- wall clock at about nine o'clock -->
  <circle cx="552" cy="62" r="30" fill="#fff" stroke="#3b4252" stroke-width="5"/>
  <line x1="552" y1="62" x2="530" y2="62" stroke="#3b4252" stroke-width="5" stroke-linecap="round"/>
  <line x1="552" y1="62" x2="552" y2="40" stroke="#3b4252" stroke-width="3" stroke-linecap="round"/>
  <!-- LEFT: woman at desk talking on the phone, looking at monitor -->
  <rect x="20" y="246" width="190" height="12" rx="3" fill="#8b5e3c"/>
  <rect x="30" y="258" width="10" height="72" fill="#6f4a2f"/><rect x="190" y="258" width="10" height="72" fill="#6f4a2f"/>
  <rect x="120" y="176" width="78" height="52" rx="4" fill="#2f3542"/>
  <rect x="126" y="182" width="66" height="40" fill="#7fb4e8"/>
  <rect x="152" y="228" width="14" height="18" fill="#2f3542"/>
  <rect x="98" y="238" width="44" height="8" rx="2" fill="#555c6b"/>
  <rect x="34" y="176" width="58" height="80" rx="20" fill="#e45b8f"/>
  <path d="M40 140 q-8 48 8 66 h40 q6 -34 2 -66z" fill="${hairDark}"/>
  <circle cx="64" cy="146" r="22" fill="${skin}"/>
  <path d="M42 144 q2 -28 24 -26 q20 2 20 24 q-12 -8 -24 -6 q-12 2 -20 8z" fill="${hairDark}"/>
  <circle cx="76" cy="148" r="3" fill="#2b2b2b"/>
  <path d="M50 190 L54 158" stroke="#e45b8f" stroke-width="14" stroke-linecap="round"/>
  <rect x="44" y="136" width="12" height="26" rx="3" fill="#22262f"/>
  <path d="M84 196 L110 232 L126 236" stroke="#e45b8f" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- MIDDLE: man pointing at colorful notes on a whiteboard -->
  <rect x="250" y="148" width="150" height="104" rx="4" fill="#ffffff" stroke="#8d97aa" stroke-width="5"/>
  <rect x="264" y="164" width="28" height="24" fill="#f6c453"/><rect x="300" y="164" width="28" height="24" fill="#7fd1b9"/>
  <rect x="336" y="164" width="28" height="24" fill="#ff9aa8"/><rect x="264" y="198" width="28" height="24" fill="#a8b7ff"/>
  <rect x="300" y="198" width="28" height="24" fill="#f6c453"/>
  <rect x="270" y="252" width="6" height="78" fill="#8d97aa"/><rect x="374" y="252" width="6" height="78" fill="#8d97aa"/>
  <rect x="410" y="256" width="15" height="74" rx="6" fill="#26324d"/><rect x="430" y="256" width="15" height="74" rx="6" fill="#26324d"/>
  <rect x="402" y="168" width="52" height="98" rx="18" fill="#3c6fd1"/>
  <path d="M410 186 L376 196 L356 190" stroke="#3c6fd1" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="350" cy="189" r="7" fill="${skin2}"/>
  <circle cx="428" cy="146" r="21" fill="${skin2}"/>
  <path d="M408 142 q2 -24 22 -24 q20 2 19 22 q-10 -8 -22 -6 q-10 2 -19 8z" fill="#1d1d1d"/>
  <circle cx="416" cy="148" r="3" fill="#2b2b2b"/>
  <!-- RIGHT: man picking up documents from a printer -->
  <rect x="520" y="250" width="100" height="80" rx="4" fill="#c9ced8"/>
  <rect x="528" y="222" width="84" height="32" rx="4" fill="#dde1e8"/>
  <rect x="540" y="214" width="56" height="10" fill="#ffffff"/>
  <rect x="540" y="270" width="60" height="6" fill="#8d97aa"/>
  <rect x="482" y="250" width="15" height="80" rx="6" fill="#3a3a3a"/><rect x="500" y="250" width="15" height="80" rx="6" fill="#3a3a3a"/>
  <rect x="474" y="162" width="50" height="98" rx="18" fill="#3fa58c"/>
  <path d="M514 184 L540 214 L552 214" stroke="#3fa58c" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="548" y="200" width="30" height="20" fill="#ffffff" stroke="#9aa7bc" stroke-width="2" transform="rotate(-8 563 210)"/>
  <circle cx="556" cy="214" r="6" fill="${skin}"/>
  <circle cx="500" cy="140" r="21" fill="${skin}"/>
  <path d="M480 136 q2 -24 22 -24 q20 2 19 22 q-10 -8 -22 -6 q-10 2 -19 8z" fill="#7a4a2a"/>
  <circle cx="512" cy="142" r="3" fill="#2b2b2b"/>
</svg>`;

  const ILLUSTRATIONS = {
    'photo-typing': PHOTO_TYPING,
    'photo-presentation': PHOTO_PRESENTATION,
    'scene-office': SCENE_OFFICE,
  };
  root.TQIllustrations = ILLUSTRATIONS;
}(typeof self !== 'undefined' ? self : this));
