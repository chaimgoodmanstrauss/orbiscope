// textures.js — the motif printed on every tile: a comma, a shape with no
// symmetry at all, so each tile shows whether it is a turned copy (teal) or a
// mirror image (sand). Drawn once into a canvas; the shader tints it.
// Red channel: comma body; green channel: its outline.

export function makeCommaCanvas(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, size, size);
  const s = size / 100;
  const path = new Path2D();
  // head: a fat disc; tail: a curling taper to the lower left
  path.moveTo(62 * s, 30 * s);
  path.bezierCurveTo(80 * s, 34 * s, 84 * s, 56 * s, 70 * s, 66 * s);
  path.bezierCurveTo(62 * s, 74 * s, 52 * s, 80 * s, 40 * s, 86 * s);
  path.bezierCurveTo(30 * s, 90 * s, 20 * s, 90 * s, 14 * s, 86 * s);
  path.bezierCurveTo(28 * s, 84 * s, 40 * s, 76 * s, 46 * s, 66 * s);
  path.bezierCurveTo(34 * s, 62 * s, 32 * s, 44 * s, 42 * s, 36 * s);
  path.bezierCurveTo(47 * s, 31 * s, 55 * s, 29 * s, 62 * s, 30 * s);
  path.closePath();
  // outline in green
  g.lineJoin = 'round';
  g.strokeStyle = 'rgb(0,255,0)';
  g.lineWidth = 7 * s;
  g.stroke(path);
  // body in red (drawn over, with additive-ish composition so both channels survive)
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgb(255,0,0)';
  g.fill(path);
  // a small eye so the comma's two faces differ even in silhouette
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(59 * s, 44 * s, 5 * s, 0, 2 * Math.PI); g.fill();
  return cv;
}

// small preview for the side panel / legend (CSS-coloured)
export function commaSVG(fill, stroke, size = 22) {
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><path d="M62 30C80 34 84 56 70 66C62 74 52 80 40 86C30 90 20 90 14 86C28 84 40 76 46 66C34 62 32 44 42 36C47 31 55 29 62 30Z" fill="${fill}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/><circle cx="59" cy="44" r="5" fill="#fbfaf6"/></svg>`;
}
