/**
 * QRMaker QR Engine — Self-contained QR Code Generator
 * Implements QR Code Model 2, versions 1-10, byte mode
 * ISO/IEC 18004 standard
 */
const QREngine = (() => {

  // ── Constants ──────────────────────────────────────────────────────────────

  const EC_LEVELS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

  // [version][ecLevel] = { dataCodewords, ecCodewordsPerBlock, blocks }
  const EC_TABLE = {
    1:  { L:{dc:19,ec:7, b1:1,b2:0}, M:{dc:16,ec:10,b1:1,b2:0}, Q:{dc:13,ec:13,b1:1,b2:0}, H:{dc:9, ec:17,b1:1,b2:0} },
    2:  { L:{dc:34,ec:10,b1:1,b2:0}, M:{dc:28,ec:16,b1:1,b2:0}, Q:{dc:22,ec:22,b1:1,b2:0}, H:{dc:16,ec:28,b1:1,b2:0} },
    3:  { L:{dc:55,ec:15,b1:1,b2:0}, M:{dc:44,ec:26,b1:1,b2:0}, Q:{dc:17,ec:18,b1:2,b2:0}, H:{dc:13,ec:22,b1:2,b2:0} },
    4:  { L:{dc:80,ec:20,b1:1,b2:0}, M:{dc:32,ec:18,b1:2,b2:0}, Q:{dc:24,ec:26,b1:2,b2:0}, H:{dc:9, ec:16,b1:4,b2:0} },
    5:  { L:{dc:108,ec:26,b1:1,b2:0},M:{dc:43,ec:24,b1:2,b2:0}, Q:{dc:15,ec:18,b1:2,b2:2}, H:{dc:11,ec:22,b1:2,b2:2} },
    6:  { L:{dc:136,ec:18,b1:2,b2:0},M:{dc:27,ec:16,b1:4,b2:0}, Q:{dc:19,ec:24,b1:4,b2:0}, H:{dc:15,ec:28,b1:4,b2:0} },
    7:  { L:{dc:156,ec:20,b1:2,b2:0},M:{dc:31,ec:18,b1:4,b2:0}, Q:{dc:14,ec:18,b1:2,b2:4}, H:{dc:13,ec:26,b1:4,b2:1} },
    8:  { L:{dc:194,ec:24,b1:2,b2:0},M:{dc:38,ec:22,b1:2,b2:2}, Q:{dc:18,ec:22,b1:4,b2:2}, H:{dc:14,ec:26,b1:4,b2:2} },
    9:  { L:{dc:232,ec:30,b1:2,b2:0},M:{dc:36,ec:22,b1:3,b2:2}, Q:{dc:16,ec:20,b1:4,b2:4}, H:{dc:12,ec:24,b1:4,b2:4} },
    10: { L:{dc:274,ec:18,b1:4,b2:0},M:{dc:43,ec:26,b1:4,b2:1}, Q:{dc:19,ec:24,b1:6,b2:2}, H:{dc:15,ec:28,b1:6,b2:2} },
  };

  // Max data bytes per version per EC level
  const VERSION_CAPACITY = {
    1:  { L:17,  M:14,  Q:11,  H:7  },
    2:  { L:32,  M:26,  Q:20,  H:14 },
    3:  { L:53,  M:42,  Q:32,  H:24 },
    4:  { L:78,  M:62,  Q:46,  H:34 },
    5:  { L:106, M:84,  Q:60,  H:44 },
    6:  { L:134, M:106, Q:74,  H:58 },
    7:  { L:154, M:122, Q:86,  H:64 },
    8:  { L:192, M:154, Q:108, H:84 },
    9:  { L:230, M:180, Q:130, H:98 },
    10: { L:271, M:213, Q:151, H:119},
  };

  // Alignment pattern centers (version 2+)
  const ALIGNMENT_CENTERS = {
    1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],
    6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]
  };

  // Format info strings [ecLevel*4 + maskPattern] (15 bits with BCH, error corrected)
  const FORMAT_INFO = [
    0x77C4,0x72F3,0x7DAA,0x789D,0x662F,0x6318,0x6C41,0x6976, // L
    0x5412,0x5125,0x5E7C,0x5B4B,0x45F9,0x40CE,0x4F97,0x4AA0, // M
    0x355F,0x3068,0x3F31,0x3A06,0x24B4,0x2183,0x2EDA,0x2BED, // Q
    0x1689,0x13BE,0x1CE7,0x19D0,0x0762,0x0255,0x0D0C,0x083B, // H
  ];

  // GF(256) log/exp tables for Reed-Solomon
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
  }

  function gfPow(x, power) {
    return GF_EXP[(GF_LOG[x] * power) % 255];
  }

  function gfPolyMul(p, q) {
    const r = new Uint8Array(p.length + q.length - 1);
    for (let i = 0; i < p.length; i++)
      for (let j = 0; j < q.length; j++)
        r[i + j] ^= gfMul(p[i], q[j]);
    return r;
  }

  function rsGeneratorPoly(degree) {
    let g = new Uint8Array([1]);
    for (let i = 0; i < degree; i++)
      g = gfPolyMul(g, new Uint8Array([1, GF_EXP[i]]));
    return g;
  }

  function reedSolomonEncode(data, ecCount) {
    const gen = rsGeneratorPoly(ecCount);
    const msg = new Uint8Array(data.length + ecCount);
    msg.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = msg[i];
      if (coef !== 0) {
        for (let j = 1; j < gen.length; j++)
          msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
    return msg.slice(data.length);
  }

  // ── QR Matrix helpers ──────────────────────────────────────────────────────

  function makeMatrix(size) {
    const m = [];
    for (let i = 0; i < size; i++) m.push(new Uint8Array(size)); // 0=light, 1=dark
    return m;
  }

  function copyMatrix(m) {
    return m.map(r => new Uint8Array(r));
  }

  // reserved[i][j] = 1 means this module is occupied by a function pattern
  function makeReserved(size) {
    const r = [];
    for (let i = 0; i < size; i++) r.push(new Uint8Array(size));
    return r;
  }

  function setFinderPattern(matrix, reserved, row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = row + r, mc = col + c;
        if (mr < 0 || mr >= matrix.length || mc < 0 || mc >= matrix.length) continue;
        const inOuter = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                        (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const inInner = (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        const isSeparator = (r === -1 || r === 7 || c === -1 || c === 7);
        if (isSeparator) {
          matrix[mr][mc] = 0;
        } else if (inInner || inOuter) {
          matrix[mr][mc] = 1;
        } else {
          matrix[mr][mc] = 0;
        }
        reserved[mr][mc] = 1;
      }
    }
  }

  function setTimingPatterns(matrix, reserved, size) {
    for (let i = 8; i < size - 8; i++) {
      const v = (i % 2 === 0) ? 1 : 0;
      matrix[6][i] = v; reserved[6][i] = 1;
      matrix[i][6] = v; reserved[i][6] = 1;
    }
  }

  function setAlignmentPatterns(matrix, reserved, version) {
    const centers = ALIGNMENT_CENTERS[version] || [];
    if (centers.length < 2) return;
    for (const r of centers) {
      for (const c of centers) {
        if (reserved[r][c]) continue; // skip if already occupied
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const mr = r + dr, mc = c + dc;
            const isEdge = (dr === -2 || dr === 2 || dc === -2 || dc === 2);
            const isCenter = (dr === 0 && dc === 0);
            matrix[mr][mc] = (isEdge || isCenter) ? 1 : 0;
            reserved[mr][mc] = 1;
          }
        }
      }
    }
  }

  function setDarkModule(matrix, reserved, version) {
    const r = 4 * version + 9;
    matrix[r][8] = 1;
    reserved[r][8] = 1;
  }

  function reserveFormatArea(reserved, size) {
    // Horizontal format info (row 8)
    for (let i = 0; i <= 8; i++) reserved[8][i] = 1;
    for (let i = size - 8; i < size; i++) reserved[8][i] = 1;
    // Vertical format info (col 8)
    for (let i = 0; i <= 8; i++) reserved[i][8] = 1;
    for (let i = size - 7; i < size; i++) reserved[i][8] = 1;
  }

  function applyFormatInfo(matrix, ecLevelBits, maskPattern, size) {
    // ecLevelBits: 0=M,1=L,2=H,3=Q (encoded)
    const ecIdx = { 1:0, 0:1, 2:2, 3:3 }[ecLevelBits] || 0;
    const fmtIdx = ecIdx * 8 + maskPattern;
    const fmt = FORMAT_INFO[fmtIdx] ^ 0x5412; // XOR mask 101010000010010

    // Actually FORMAT_INFO already has the mask applied per spec
    // Let's compute it properly:
    // Format info = (ecLevel 2 bits)(mask 3 bits) -> 5 bits -> BCH(15,5) -> XOR with 101010000010010
    const fmtInfo = computeFormatInfo(ecLevelBits, maskPattern);

    const bits = [];
    for (let i = 14; i >= 0; i--) bits.push((fmtInfo >> i) & 1);

    // Place around top-left finder
    const positions1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
                        [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    const positions2 = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],
                        [8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]];

    for (let i = 0; i < 15; i++) {
      matrix[positions1[i][0]][positions1[i][1]] = bits[i];
      matrix[positions2[i][0]][positions2[i][1]] = bits[i];
    }
  }

  function computeFormatInfo(ecLevel, maskPattern) {
    // ecLevel bits: L=01, M=00, Q=11, H=10
    const data = (ecLevel << 3) | maskPattern;
    // BCH code
    let d = data << 10;
    const gen = 0x537; // 10100110111
    for (let i = 4; i >= 0; i--) {
      if ((d >> (i + 10)) & 1) d ^= gen << i;
    }
    return ((data << 10) | d) ^ 0x5412;
  }

  // ── Data encoding ──────────────────────────────────────────────────────────

  function encodeData(text, version, ecLevel) {
    const bytes = new TextEncoder().encode(text);
    const info = EC_TABLE[version][ecLevel];
    const totalDC = info.dc;

    // Build bit stream
    const bits = [];
    function pushBits(value, count) {
      for (let i = count - 1; i >= 0; i--) bits.push((value >> i) & 1);
    }

    // Mode indicator: byte = 0100
    pushBits(0b0100, 4);

    // Character count indicator
    const cciBits = version <= 9 ? 8 : 16;
    pushBits(bytes.length, cciBits);

    // Data bytes
    for (const b of bytes) pushBits(b, 8);

    // Terminator
    const maxBits = totalDC * 8;
    for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);

    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);

    // Pad codewords
    let padIdx = 0;
    const padBytes = [0xEC, 0x11];
    while (bits.length < maxBits) {
      pushBits(padBytes[padIdx % 2], 8);
      padIdx++;
    }

    // Convert to bytes
    const dcBytes = new Uint8Array(totalDC);
    for (let i = 0; i < totalDC; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i * 8 + j] || 0);
      dcBytes[i] = b;
    }
    return dcBytes;
  }

  function interleaveBlocks(version, ecLevel, dcBytes) {
    const info = EC_TABLE[version][ecLevel];
    const ecCount = info.ec;
    const b1Count = info.b1;
    const b2Count = info.b2;
    const totalBlocks = b1Count + b2Count;

    // Split data codewords into blocks
    const dcPerB1 = Math.floor(dcBytes.length / totalBlocks);
    const dcPerB2 = dcPerB1 + 1;

    const blocks = [];
    let offset = 0;
    for (let i = 0; i < b1Count; i++) {
      blocks.push({ dc: dcBytes.slice(offset, offset + dcPerB1) });
      offset += dcPerB1;
    }
    for (let i = 0; i < b2Count; i++) {
      blocks.push({ dc: dcBytes.slice(offset, offset + dcPerB2) });
      offset += dcPerB2;
    }

    // Generate EC codewords for each block
    for (const block of blocks) block.ec = reedSolomonEncode(block.dc, ecCount);

    // Interleave data
    const result = [];
    const maxDC = Math.max(...blocks.map(b => b.dc.length));
    for (let i = 0; i < maxDC; i++)
      for (const block of blocks) if (i < block.dc.length) result.push(block.dc[i]);

    // Interleave EC
    for (let i = 0; i < ecCount; i++)
      for (const block of blocks) result.push(block.ec[i]);

    return new Uint8Array(result);
  }

  // ── Data placement ─────────────────────────────────────────────────────────

  function placeData(matrix, reserved, codewords) {
    const size = matrix.length;
    let bitIdx = 0;
    const totalBits = codewords.length * 8;

    let col = size - 1;
    let goingUp = true;

    while (col > 0) {
      if (col === 6) col--; // skip timing column

      for (let rowOffset = 0; rowOffset < size; rowOffset++) {
        const row = goingUp ? (size - 1 - rowOffset) : rowOffset;
        for (let dc = 0; dc <= 1; dc++) {
          const c = col - dc;
          if (!reserved[row][c]) {
            const bit = bitIdx < totalBits
              ? (codewords[Math.floor(bitIdx / 8)] >> (7 - (bitIdx % 8))) & 1
              : 0;
            matrix[row][c] = bit;
            bitIdx++;
          }
        }
      }
      col -= 2;
      goingUp = !goingUp;
    }
  }

  // ── Masking ────────────────────────────────────────────────────────────────

  const maskFunctions = [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  function applyMask(matrix, reserved, maskPattern) {
    const fn = maskFunctions[maskPattern];
    const size = matrix.length;
    const m = copyMatrix(matrix);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!reserved[r][c] && fn(r, c)) m[r][c] ^= 1;
    return m;
  }

  function evaluatePenalty(matrix) {
    const size = matrix.length;
    let penalty = 0;

    // Rule 1: 5+ consecutive modules of same color in row/col
    for (let r = 0; r < size; r++) {
      for (let start = 0; start < size;) {
        let end = start;
        while (end < size && matrix[r][end] === matrix[r][start]) end++;
        const run = end - start;
        if (run >= 5) penalty += 3 + (run - 5);
        start = end;
      }
    }
    for (let c = 0; c < size; c++) {
      for (let start = 0; start < size;) {
        let end = start;
        while (end < size && matrix[end][c] === matrix[start][c]) end++;
        const run = end - start;
        if (run >= 5) penalty += 3 + (run - 5);
        start = end;
      }
    }

    // Rule 2: 2x2 blocks
    for (let r = 0; r < size - 1; r++)
      for (let c = 0; c < size - 1; c++)
        if (matrix[r][c] === matrix[r+1][c] &&
            matrix[r][c] === matrix[r][c+1] &&
            matrix[r][c] === matrix[r+1][c+1])
          penalty += 3;

    // Rule 3: specific patterns
    const p1 = [1,0,1,1,1,0,1,0,0,0,0];
    const p2 = [0,0,0,0,1,0,1,1,1,0,1];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c <= size - 11; c++) {
        let m1 = true, m2 = true;
        for (let k = 0; k < 11; k++) {
          if (matrix[r][c+k] !== p1[k]) m1 = false;
          if (matrix[r][c+k] !== p2[k]) m2 = false;
        }
        if (m1 || m2) penalty += 40;
      }
    }
    for (let c = 0; c < size; c++) {
      for (let r = 0; r <= size - 11; r++) {
        let m1 = true, m2 = true;
        for (let k = 0; k < 11; k++) {
          if (matrix[r+k][c] !== p1[k]) m1 = false;
          if (matrix[r+k][c] !== p2[k]) m2 = false;
        }
        if (m1 || m2) penalty += 40;
      }
    }

    // Rule 4: proportion of dark modules
    let dark = 0;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (matrix[r][c]) dark++;
    const total = size * size;
    const pct = (dark / total) * 100;
    const prev5 = Math.floor(pct / 5) * 5;
    const next5 = prev5 + 5;
    penalty += Math.min(Math.abs(prev5 - 50), Math.abs(next5 - 50)) * 2;

    return penalty;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function selectVersion(text, ecLevel) {
    const bytes = new TextEncoder().encode(text);
    for (let v = 1; v <= 10; v++) {
      if (VERSION_CAPACITY[v][ecLevel] >= bytes.length) return v;
    }
    return null; // too long for v10
  }

  function generate(text, options = {}) {
    const ecLevel = options.errorLevel || 'M';
    const version = options.version || selectVersion(text, ecLevel);
    if (!version) {
      const truncated = text.substring(0, VERSION_CAPACITY[10][ecLevel]);
      return generate(truncated, options);
    }

    const size = 4 * version + 17;
    const matrix = makeMatrix(size);
    const reserved = makeReserved(size);

    // Place function patterns
    setFinderPattern(matrix, reserved, 0, 0);           // top-left
    setFinderPattern(matrix, reserved, 0, size - 7);    // top-right
    setFinderPattern(matrix, reserved, size - 7, 0);    // bottom-left
    setTimingPatterns(matrix, reserved, size);
    setAlignmentPatterns(matrix, reserved, version);
    setDarkModule(matrix, reserved, version);
    reserveFormatArea(reserved, size);

    // Encode data
    const ecLevelBits = EC_LEVELS[ecLevel];
    const dcBytes = encodeData(text, version, ecLevel);
    const codewords = interleaveBlocks(version, ecLevel, dcBytes);

    // Place data
    placeData(matrix, reserved, codewords);

    // Find best mask
    let bestMask = 0, bestPenalty = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const masked = applyMask(matrix, reserved, mask);
      applyFormatInfo(masked, ecLevelBits, mask, size);
      const p = evaluatePenalty(masked);
      if (p < bestPenalty) { bestPenalty = p; bestMask = mask; }
    }

    // Apply best mask and format info
    const finalMatrix = applyMask(matrix, reserved, bestMask);
    applyFormatInfo(finalMatrix, ecLevelBits, bestMask, size);

    return finalMatrix;
  }

  function getSize(version) {
    return 4 * version + 17;
  }

  // ── Content builders ───────────────────────────────────────────────────────

  function buildContent(type, data) {
    switch (type) {
      case 'url': {
        let url = (data.url || '').trim();
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        return url;
      }
      case 'text':
        return data.text || '';

      case 'whatsapp': {
        let number = (data.phone || '').replace(/\D/g, '');
        const cc = (data.countryCode || '91').replace(/\D/g, '');
        if (!number.startsWith(cc)) number = cc + number;
        if (data.message) return 'https://wa.me/' + number + '?text=' + encodeURIComponent(data.message);
        return 'https://wa.me/' + number;
      }
      case 'upi': {
        const pa = (data.upiId || '').trim();
        const pn = encodeURIComponent((data.name || '').trim());
        const am = data.amount ? '&am=' + encodeURIComponent(data.amount) : '';
        const tn = data.note ? '&tn=' + encodeURIComponent(data.note) : '';
        return 'upi://pay?pa=' + pa + '&pn=' + pn + am + tn + '&cu=INR';
      }
      case 'wifi': {
        const ssid = (data.ssid || '').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/"/g,'\\"');
        const pw = (data.password || '').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/"/g,'\\"');
        const sec = data.security || 'WPA';
        const hidden = data.hidden ? 'true' : 'false';
        return 'WIFI:T:' + sec + ';S:' + ssid + ';P:' + pw + ';H:' + hidden + ';;';
      }
      case 'vcard': {
        const fn = (data.firstName || '') + ' ' + (data.lastName || '');
        return 'BEGIN:VCARD\nVERSION:3.0\n' +
          'N:' + (data.lastName||'') + ';' + (data.firstName||'') + ';;;\n' +
          'FN:' + fn.trim() + '\n' +
          (data.org ? 'ORG:' + data.org + '\n' : '') +
          (data.title ? 'TITLE:' + data.title + '\n' : '') +
          (data.phone ? 'TEL;TYPE=CELL:' + data.phone + '\n' : '') +
          (data.email ? 'EMAIL:' + data.email + '\n' : '') +
          (data.website ? 'URL:' + data.website + '\n' : '') +
          (data.address ? 'ADR:;;' + data.address + ';;;;\n' : '') +
          'END:VCARD';
      }
      case 'email': {
        const s = encodeURIComponent(data.subject || '');
        const b = encodeURIComponent(data.body || '');
        return 'mailto:' + (data.email || '') + '?subject=' + s + '&body=' + b;
      }
      case 'sms': {
        let number = (data.phone || '').replace(/\D/g, '');
        const msg = encodeURIComponent(data.message || '');
        return 'sms:+' + number + (msg ? '?body=' + msg : '');
      }
      case 'phone':
        return 'tel:' + (data.phone || '').replace(/\s/g, '');

      case 'location': {
        const lat = data.lat || 0, lng = data.lng || 0;
        const label = encodeURIComponent(data.label || '');
        return 'geo:' + lat + ',' + lng + '?q=' + lat + ',' + lng + '(' + label + ')';
      }
      case 'instagram': {
        const user = (data.username || '').replace('@', '');
        return 'https://instagram.com/' + user;
      }
      case 'youtube':
        return data.url || '';

      case 'linkedin': {
        const user = (data.username || '').replace('@', '');
        if (user.startsWith('http')) return user;
        return 'https://linkedin.com/in/' + user;
      }
      case 'twitter': {
        const user = (data.username || '').replace('@', '');
        return 'https://twitter.com/' + user;
      }
      case 'telegram': {
        const user = (data.username || '').replace('@', '');
        return 'https://t.me/' + user;
      }
      case 'event': {
        const toICS = s => s.replace(/[-:T]/g, '').substring(0, 15) + 'Z';
        return 'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\n' +
          'SUMMARY:' + (data.title || '') + '\n' +
          'DTSTART:' + toICS(data.start || new Date().toISOString()) + '\n' +
          'DTEND:' + toICS(data.end || new Date().toISOString()) + '\n' +
          (data.location ? 'LOCATION:' + data.location + '\n' : '') +
          (data.description ? 'DESCRIPTION:' + data.description + '\n' : '') +
          'END:VEVENT\nEND:VCALENDAR';
      }
      default:
        return data.text || data.url || '';
    }
  }

  return { generate, getSize, buildContent, selectVersion };
})();

window.QREngine = QREngine;
