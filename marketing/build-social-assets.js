const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const output = path.join(__dirname, "output", "social");

const banner = `
<svg width="2560" height="1440" viewBox="0 0 2560 1440" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#07101f"/>
      <stop offset="0.52" stop-color="#101a2d"/>
      <stop offset="1" stop-color="#07121b"/>
    </linearGradient>
    <radialGradient id="light" cx="50%" cy="50%" r="55%">
      <stop offset="0" stop-color="#4f8ef7" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#4f8ef7" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse">
      <path d="M72 0H0V72" fill="none" stroke="#8fb6ff" stroke-opacity="0.06" stroke-width="1"/>
    </pattern>
    <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000814" flood-opacity="0.55"/>
    </filter>
  </defs>
  <rect width="2560" height="1440" fill="url(#bg)"/>
  <rect width="2560" height="1440" fill="url(#light)"/>
  <rect width="2560" height="1440" fill="url(#grid)"/>
  <path d="M0 1010C430 850 690 980 1030 830C1390 670 1700 795 2560 505V1440H0Z" fill="#0a1324" fill-opacity="0.48"/>
  <circle cx="540" cy="462" r="7" fill="#6ea4ff"/>
  <circle cx="2050" cy="950" r="7" fill="#ff9d3d"/>
  <circle cx="2190" cy="430" r="4" fill="#6fe0c1"/>
  <g filter="url(#shadow)">
    <rect x="585" y="510" width="1390" height="420" rx="46" fill="#111c31" fill-opacity="0.78" stroke="#9bbcff" stroke-opacity="0.18"/>
    <rect x="587" y="512" width="1386" height="416" rx="44" fill="none" stroke="#ffffff" stroke-opacity="0.06"/>
  </g>
  <rect x="715" y="622" width="176" height="176" rx="38" fill="#25344d"/>
  <text x="938" y="684" fill="#f4f7ff" font-family="Arial, Helvetica, sans-serif" font-size="94" font-weight="700">Estudiemos</text>
  <text x="942" y="755" fill="#aebbd1" font-family="Arial, Helvetica, sans-serif" font-size="38">Tu estudio, conectado.</text>
  <g transform="translate(942 804)">
    <rect width="164" height="44" rx="22" fill="#17253d"/>
    <circle cx="25" cy="22" r="6" fill="#6ea4ff"/>
    <text x="44" y="29" fill="#c9d7ee" font-family="Arial, Helvetica, sans-serif" font-size="22">Organizá</text>
    <rect x="180" width="152" height="44" rx="22" fill="#17253d"/>
    <circle cx="205" cy="22" r="6" fill="#6fe0c1"/>
    <text x="224" y="29" fill="#c9d7ee" font-family="Arial, Helvetica, sans-serif" font-size="22">Enfocate</text>
    <rect x="348" width="142" height="44" rx="22" fill="#17253d"/>
    <circle cx="373" cy="22" r="6" fill="#ff9d3d"/>
    <text x="392" y="29" fill="#c9d7ee" font-family="Arial, Helvetica, sans-serif" font-size="22">Avanzá</text>
  </g>
</svg>`;

async function build() {
  await fs.promises.mkdir(output, { recursive: true });
  const logo = await sharp(path.join(root, "assets", "icon-512.png"))
    .resize(152, 152)
    .png()
    .toBuffer();
  await sharp(Buffer.from(banner))
    .composite([
      {
        input: logo,
        left: 727,
        top: 634,
        blend: "over",
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(output, "estudiemos-youtube-banner-2560x1440.png"));
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
