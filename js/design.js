/**
 * QRMaker Design — QR Code Canvas Renderer & Customization
 */
const QRDesign = (() => {

  const STYLES = {
    dot: ['square', 'rounded', 'dots', 'smooth'],
    eye: ['square', 'rounded', 'circle'],
    eyeBall: ['square', 'dot'],
  };

  // ── Core rendering ─────────────────────────────────────────────────────────

  function render(matrix, canvas, options = {}) {
    const opts = Object.assign({
      size: 300,
      fgColor: '#000000',
      bgColor: '#ffffff',
      dotStyle: 'square',
      eyeStyle: 'square',
      eyeBallStyle: 'square',
      gradientType: null,
      gradientColor2: null,
      logoImage: null,
      logoSize: 0.25,
      margin: 2,
      errorLevel: 'M',
    }, options);

    const n = matrix.length;
    const totalModules = n + opts.margin * 2;
    const px = opts.size;
    const mod = px / totalModules;
    const off = opts.margin * mod;

    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = opts.bgColor;
    ctx.fillRect(0, 0, px, px);

    // Determine paint style for dots
    let fillStyle;
    if (opts.gradientType && opts.gradientColor2) {
      if (opts.gradientType === 'linear') {
        const g = ctx.createLinearGradient(0, 0, px, px);
        g.addColorStop(0, opts.fgColor);
        g.addColorStop(1, opts.gradientColor2);
        fillStyle = g;
      } else {
        const g = ctx.createRadialGradient(px/2, px/2, 0, px/2, px/2, px/2);
        g.addColorStop(0, opts.fgColor);
        g.addColorStop(1, opts.gradientColor2);
        fillStyle = g;
      }
    } else {
      fillStyle = opts.fgColor;
    }

    // Eye corner positions (in module coordinates)
    const eyePositions = [
      { row: 0, col: 0 },                  // top-left
      { row: 0, col: n - 7 },              // top-right
      { row: n - 7, col: 0 },              // bottom-left
    ];

    function isInEye(r, c) {
      for (const ep of eyePositions) {
        if (r >= ep.row && r < ep.row + 7 && c >= ep.col && c < ep.col + 7) return true;
      }
      return false;
    }

    ctx.fillStyle = fillStyle;

    // Draw data dots (skip eye areas)
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!matrix[r][c]) continue;
        if (isInEye(r, c)) continue;

        const x = off + c * mod;
        const y = off + r * mod;

        drawDot(ctx, x, y, mod, opts.dotStyle);
      }
    }

    // Draw eyes
    ctx.fillStyle = opts.fgColor;
    for (const ep of eyePositions) {
      const ex = off + ep.col * mod;
      const ey = off + ep.row * mod;
      drawEye(ctx, ex, ey, mod, opts.eyeStyle, opts.eyeBallStyle, opts.fgColor, opts.bgColor);
    }

    // Draw logo
    if (opts.logoImage) {
      const logoW = px * opts.logoSize;
      const logoH = logoW;
      const logoX = (px - logoW) / 2;
      const logoY = (px - logoH) / 2;

      // White background behind logo
      const pad = logoW * 0.15;
      ctx.fillStyle = opts.bgColor;
      roundRect(ctx, logoX - pad, logoY - pad, logoW + pad*2, logoH + pad*2, 6);
      ctx.fill();

      ctx.drawImage(opts.logoImage, logoX, logoY, logoW, logoH);
    }
  }

  function drawDot(ctx, x, y, size, style) {
    const s = size * 0.9; // slight gap
    const dx = x + (size - s) / 2;
    const dy = y + (size - s) / 2;

    switch (style) {
      case 'dots':
        ctx.beginPath();
        ctx.arc(dx + s/2, dy + s/2, s/2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'rounded':
        roundRect(ctx, dx, dy, s, s, s * 0.3);
        ctx.fill();
        break;
      case 'smooth':
        roundRect(ctx, dx, dy, s, s, s * 0.45);
        ctx.fill();
        break;
      default: // square
        ctx.fillRect(dx, dy, s, s);
    }
  }

  function drawEye(ctx, x, y, mod, eyeStyle, ballStyle, fgColor, bgColor) {
    const outerSize = mod * 7;
    const innerSize = mod * 5;
    const ballSize = mod * 3;
    const innerOff = mod;
    const ballOff = mod * 2;

    // Outer ring (7x7 square)
    ctx.fillStyle = fgColor;
    switch (eyeStyle) {
      case 'circle':
        ctx.beginPath();
        ctx.arc(x + outerSize/2, y + outerSize/2, outerSize/2, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.arc(x + outerSize/2, y + outerSize/2, outerSize/2 - mod, 0, Math.PI*2);
        ctx.fill();
        break;
      case 'rounded':
        roundRect(ctx, x, y, outerSize, outerSize, mod * 1.5);
        ctx.fill();
        ctx.fillStyle = bgColor;
        roundRect(ctx, x + mod, y + mod, innerSize, innerSize, mod);
        ctx.fill();
        break;
      default: // square
        ctx.fillRect(x, y, outerSize, outerSize);
        ctx.fillStyle = bgColor;
        ctx.fillRect(x + mod, y + mod, innerSize, innerSize);
    }

    // Inner ball (3x3)
    ctx.fillStyle = fgColor;
    if (ballStyle === 'dot') {
      ctx.beginPath();
      ctx.arc(x + outerSize/2, y + outerSize/2, ballSize/2, 0, Math.PI*2);
      ctx.fill();
    } else {
      ctx.fillRect(x + ballOff, y + ballOff, ballSize, ballSize);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Downloads ──────────────────────────────────────────────────────────────

  function downloadPNG(canvas, filename, size) {
    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(canvas, 0, 0, size, size);

    offscreen.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (filename || 'QRMaker-qr') + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  function downloadSVG(matrix, options, filename) {
    const opts = Object.assign({
      size: 400,
      fgColor: '#000000',
      bgColor: '#ffffff',
      dotStyle: 'square',
      margin: 2,
    }, options);

    const n = matrix.length;
    const totalModules = n + opts.margin * 2;
    const cellSize = opts.size / totalModules;
    const off = opts.margin * cellSize;

    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.size} ${opts.size}" width="${opts.size}" height="${opts.size}">`);
    parts.push(`<rect width="${opts.size}" height="${opts.size}" fill="${opts.bgColor}"/>`);

    // Eye positions
    const eyePositions = [
      { row: 0, col: 0 }, { row: 0, col: n - 7 }, { row: n - 7, col: 0 },
    ];
    function isInEye(r, c) {
      return eyePositions.some(ep => r >= ep.row && r < ep.row+7 && c >= ep.col && c < ep.col+7);
    }

    const s = cellSize * 0.9;
    const gap = (cellSize - s) / 2;
    const r = opts.dotStyle === 'square' ? 0 : opts.dotStyle === 'dots' ? s/2 : s * 0.3;

    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (!matrix[row][col]) continue;
        if (isInEye(row, col)) continue;
        const x = off + col * cellSize + gap;
        const y = off + row * cellSize + gap;
        if (opts.dotStyle === 'dots') {
          parts.push(`<circle cx="${x + s/2}" cy="${y + s/2}" r="${s/2}" fill="${opts.fgColor}"/>`);
        } else {
          parts.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${r}" fill="${opts.fgColor}"/>`);
        }
      }
    }

    // Draw eyes as SVG rectangles
    for (const ep of eyePositions) {
      const ex = off + ep.col * cellSize;
      const ey = off + ep.row * cellSize;
      const outerSize = cellSize * 7;
      const outerR = opts.eyeStyle === 'rounded' ? cellSize * 1.5 : opts.eyeStyle === 'circle' ? outerSize/2 : 0;
      parts.push(`<rect x="${ex}" y="${ey}" width="${outerSize}" height="${outerSize}" rx="${outerR}" fill="${opts.fgColor}"/>`);
      const innerOff = cellSize;
      const innerSize = cellSize * 5;
      const innerR = opts.eyeStyle === 'rounded' ? cellSize : opts.eyeStyle === 'circle' ? innerSize/2 : 0;
      parts.push(`<rect x="${ex+innerOff}" y="${ey+innerOff}" width="${innerSize}" height="${innerSize}" rx="${innerR}" fill="${opts.bgColor}"/>`);
      const ballOff = cellSize * 2;
      const ballSize = cellSize * 3;
      parts.push(`<rect x="${ex+ballOff}" y="${ey+ballOff}" width="${ballSize}" height="${ballSize}" fill="${opts.fgColor}"/>`);
    }

    parts.push('</svg>');
    const svg = parts.join('\n');

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (filename || 'QRMaker-qr') + '.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyToClipboard(canvas) {
    return new Promise((resolve, reject) => {
      if (navigator.clipboard && window.ClipboardItem) {
        canvas.toBlob(blob => {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            .then(resolve).catch(reject);
        }, 'image/png');
      } else {
        // Fallback: open in new tab
        const win = window.open();
        win.document.write('<img src="' + canvas.toDataURL() + '">');
        resolve();
      }
    });
  }

  function getDataURL(canvas) {
    return canvas.toDataURL('image/png');
  }

  // ── SVG icons for style pickers ────────────────────────────────────────────

  const DOT_STYLE_SVGS = {
    square: `<svg viewBox="0 0 24 24"><rect x="2" y="2" width="4" height="4"/><rect x="10" y="2" width="4" height="4"/><rect x="18" y="2" width="4" height="4"/><rect x="2" y="10" width="4" height="4"/><rect x="18" y="10" width="4" height="4"/><rect x="2" y="18" width="4" height="4"/><rect x="10" y="18" width="4" height="4"/><rect x="18" y="18" width="4" height="4"/></svg>`,
    rounded: `<svg viewBox="0 0 24 24"><rect x="2" y="2" width="4" height="4" rx="1.2"/><rect x="10" y="2" width="4" height="4" rx="1.2"/><rect x="18" y="2" width="4" height="4" rx="1.2"/><rect x="2" y="10" width="4" height="4" rx="1.2"/><rect x="18" y="10" width="4" height="4" rx="1.2"/><rect x="2" y="18" width="4" height="4" rx="1.2"/><rect x="10" y="18" width="4" height="4" rx="1.2"/><rect x="18" y="18" width="4" height="4" rx="1.2"/></svg>`,
    dots: `<svg viewBox="0 0 24 24"><circle cx="4" cy="4" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="4" cy="20" r="2"/><circle cx="12" cy="20" r="2"/><circle cx="20" cy="20" r="2"/></svg>`,
    smooth: `<svg viewBox="0 0 24 24"><rect x="2" y="2" width="4" height="4" rx="2"/><rect x="10" y="2" width="4" height="4" rx="2"/><rect x="18" y="2" width="4" height="4" rx="2"/><rect x="2" y="10" width="4" height="4" rx="2"/><rect x="18" y="10" width="4" height="4" rx="2"/><rect x="2" y="18" width="4" height="4" rx="2"/><rect x="10" y="18" width="4" height="4" rx="2"/><rect x="18" y="18" width="4" height="4" rx="2"/></svg>`,
  };

  const EYE_STYLE_SVGS = {
    square: `<svg viewBox="0 0 20 20"><rect x="1" y="1" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="6" y="6" width="8" height="8"/></svg>`,
    rounded: `<svg viewBox="0 0 20 20"><rect x="1" y="1" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="6" y="6" width="8" height="8" rx="2"/></svg>`,
    circle: `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="10" cy="10" r="4"/></svg>`,
  };

  return { render, downloadPNG, downloadSVG, copyToClipboard, getDataURL, STYLES, DOT_STYLE_SVGS, EYE_STYLE_SVGS, roundRect };
})();

window.QRDesign = QRDesign;
