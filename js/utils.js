/**
 * QRMaker Utils — Shared utilities
 */
const QBUtils = (() => {

  // ── DOM helpers ────────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }
  function setText(id, text) { const e = el(id); if (e) e.textContent = text; }
  function setHTML(id, html) { const e = el(id); if (e) e.innerHTML = html; }
  function show(id) { const e = el(id); if (e) e.style.display = ''; }
  function hide(id) { const e = el(id); if (e) e.style.display = 'none'; }
  function showEl(e) { if (e) e.style.display = ''; }
  function hideEl(e) { if (e) e.style.display = 'none'; }

  // ── Toast ──────────────────────────────────────────────────────────────────

  let toastContainer = null;
  function getToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  function showToast(msg, type = 'info') {
    const c = getToastContainer();
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.3s';
      setTimeout(() => t.remove(), 300);
    }, 2500);
  }

  // ── Clipboard ──────────────────────────────────────────────────────────────

  function copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('Copied!', 'success'))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('Copied!', 'success');
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  function isValidURL(str) {
    if (!str) return false;
    try {
      const u = new URL(str.startsWith('http') ? str : 'https://' + str);
      return u.hostname.includes('.');
    } catch { return false; }
  }

  function isValidUPI(str) {
    return /^[\w.\-+]+@[\w.\-]+$/.test((str || '').trim());
  }

  function isValidPhone(str) {
    return (str || '').replace(/\D/g, '').length >= 10;
  }

  function isValidEmail(str) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((str || '').trim());
  }

  function formatUPIId(str) {
    return (str || '').trim().toLowerCase();
  }

  // ── CSV ────────────────────────────────────────────────────────────────────

  function parseCSV(text) {
    const rows = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          cols.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      cols.push(current.trim());
      rows.push(cols);
    }
    return rows;
  }

  // ── Filename ───────────────────────────────────────────────────────────────

  function generateFilename(type, data) {
    const sanitize = s => (s || '').replace(/[^a-z0-9.\-]/gi, '-').substring(0, 30);
    switch (type) {
      case 'url': return 'QRMaker-url-' + sanitize(new URL(data.url || 'https://x.com').hostname);
      case 'upi': return 'QRMaker-upi-' + sanitize(data.upiId);
      case 'wifi': return 'QRMaker-wifi-' + sanitize(data.ssid);
      case 'whatsapp': return 'QRMaker-whatsapp-' + sanitize(data.phone);
      case 'vcard': return 'QRMaker-vcard-' + sanitize(data.firstName + '-' + data.lastName);
      case 'email': return 'QRMaker-email-' + sanitize(data.email);
      case 'event': return 'QRMaker-event-' + sanitize(data.title);
      default: return 'QRMaker-' + type;
    }
  }

  // ── Debounce ───────────────────────────────────────────────────────────────

  function debounce(fn, ms) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ── FAQ accordion ──────────────────────────────────────────────────────────

  function initFAQ() {
    document.querySelectorAll('.faq-item').forEach(item => {
      const q = item.querySelector('.faq-q');
      if (q) q.addEventListener('click', () => item.classList.toggle('open'));
    });
  }

  // ── Tab system ─────────────────────────────────────────────────────────────

  function initTabs(containerSelector) {
    const containers = document.querySelectorAll(containerSelector || '.tab-container');
    containers.forEach(container => {
      const btns = container.querySelectorAll('.tab-btn');
      const panels = container.querySelectorAll('.tab-panel');
      btns.forEach((btn, i) => {
        btn.addEventListener('click', () => {
          btns.forEach(b => b.classList.remove('active'));
          panels.forEach(p => p.classList.remove('active'));
          btn.classList.add('active');
          if (panels[i]) panels[i].classList.add('active');
        });
      });
    });
  }

  // ── QR State Machine ───────────────────────────────────────────────────────
  // Shared QR generator state for all pages

  function createQRState() {
    return {
      matrix: null,
      content: '',
      options: {
        dotStyle: 'square',
        eyeStyle: 'square',
        eyeBallStyle: 'square',
        fgColor: '#000000',
        bgColor: '#ffffff',
        gradientType: null,
        gradientColor2: null,
        logoImage: null,
        logoSize: 0.25,
        errorLevel: 'M',
        margin: 2,
      },
    };
  }

  function renderQR(state, canvas) {
    if (!state.matrix || !canvas) return;
    const size = canvas.parentElement ? canvas.parentElement.offsetWidth || 256 : 256;
    QRDesign.render(state.matrix, canvas, Object.assign({ size: Math.min(Math.max(size - 32, 200), 320) }, state.options));
  }

  // ── Design panel wiring ───────────────────────────────────────────────────

  function wireDesignPanel(state, onUpdate) {
    // Dot style
    document.querySelectorAll('[data-dot-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-dot-style]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.options.dotStyle = btn.dataset.dotStyle;
        onUpdate();
      });
    });

    // Eye style
    document.querySelectorAll('[data-eye-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-eye-style]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.options.eyeStyle = btn.dataset.eyeStyle;
        onUpdate();
      });
    });

    // Colors
    const fgPicker = el('fg-color-picker');
    const fgHex = el('fg-color-hex');
    const bgPicker = el('bg-color-picker');
    const bgHex = el('bg-color-hex');

    if (fgPicker) fgPicker.addEventListener('input', () => {
      state.options.fgColor = fgPicker.value;
      if (fgHex) fgHex.value = fgPicker.value;
      onUpdate();
    });
    if (fgHex) fgHex.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(fgHex.value)) {
        state.options.fgColor = fgHex.value;
        if (fgPicker) fgPicker.value = fgHex.value;
        onUpdate();
      }
    });
    if (bgPicker) bgPicker.addEventListener('input', () => {
      state.options.bgColor = bgPicker.value;
      if (bgHex) bgHex.value = bgPicker.value;
      onUpdate();
    });
    if (bgHex) bgHex.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(bgHex.value)) {
        state.options.bgColor = bgHex.value;
        if (bgPicker) bgPicker.value = bgHex.value;
        onUpdate();
      }
    });

    // EC level
    document.querySelectorAll('[data-ec]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-ec]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.options.errorLevel = btn.dataset.ec;
        onUpdate();
      });
    });

    // Logo upload
    const logoInput = el('logo-input');
    const logoZone = el('logo-zone');
    const logoPreviewWrap = el('logo-preview-wrap');
    const logoPreview = el('logo-preview-img');
    const removeLogoBtn = el('remove-logo-btn');
    const logoSizeSlider = el('logo-size-slider');
    const logoSizeVal = el('logo-size-val');

    if (logoZone) {
      logoZone.addEventListener('click', () => logoInput && logoInput.click());
      logoZone.addEventListener('dragover', e => { e.preventDefault(); logoZone.classList.add('hover'); });
      logoZone.addEventListener('dragleave', () => logoZone.classList.remove('hover'));
      logoZone.addEventListener('drop', e => {
        e.preventDefault();
        logoZone.classList.remove('hover');
        const file = e.dataTransfer.files[0];
        if (file) loadLogoFile(file, state, logoZone, logoPreviewWrap, logoPreview, onUpdate);
      });
    }
    if (logoInput) logoInput.addEventListener('change', () => {
      const file = logoInput.files[0];
      if (file) loadLogoFile(file, state, logoZone, logoPreviewWrap, logoPreview, onUpdate);
    });
    if (removeLogoBtn) removeLogoBtn.addEventListener('click', () => {
      state.options.logoImage = null;
      if (logoZone) { logoZone.classList.remove('has-logo'); logoZone.style.display = ''; }
      if (logoPreviewWrap) logoPreviewWrap.style.display = 'none';
      onUpdate();
    });
    if (logoSizeSlider) logoSizeSlider.addEventListener('input', () => {
      state.options.logoSize = parseInt(logoSizeSlider.value) / 100;
      if (logoSizeVal) logoSizeVal.textContent = logoSizeSlider.value + '%';
      onUpdate();
    });
  }

  function loadLogoFile(file, state, logoZone, logoPreviewWrap, logoPreview, onUpdate) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        state.options.logoImage = img;
        if (logoZone) logoZone.style.display = 'none';
        if (logoPreviewWrap) { logoPreviewWrap.style.display = 'flex'; }
        if (logoPreview) logoPreview.src = e.target.result;
        onUpdate();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ── Download wiring ────────────────────────────────────────────────────────

  function wireDownloads(state, canvas, getFilename) {
    let selectedSize = 1024;

    document.querySelectorAll('.size-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.size-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedSize = parseInt(btn.dataset.size);
      });
    });

    const dlPng = el('dl-png');
    const dlSvg = el('dl-svg');
    const dlCopy = el('dl-copy');

    if (dlPng) dlPng.addEventListener('click', () => {
      if (!state.matrix) { showToast('Generate a QR code first', 'error'); return; }
      QRDesign.downloadPNG(canvas, getFilename(), selectedSize);
      showToast('PNG downloaded!', 'success');
    });

    if (dlSvg) dlSvg.addEventListener('click', () => {
      if (!state.matrix) { showToast('Generate a QR code first', 'error'); return; }
      QRDesign.downloadSVG(state.matrix, state.options, getFilename());
      showToast('SVG downloaded!', 'success');
    });

    if (dlCopy) dlCopy.addEventListener('click', () => {
      if (!state.matrix) { showToast('Generate a QR code first', 'error'); return; }
      QRDesign.copyToClipboard(canvas)
        .then(() => showToast('Copied to clipboard!', 'success'))
        .catch(() => showToast('Copy not supported — PNG downloaded instead', 'info'));
    });
  }

  // ── Design panel HTML builder ──────────────────────────────────────────────

  function buildDesignPanelHTML() {
    return `
<div class="design-card">
  <div class="collapsible-header" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('open')">
    <span class="form-title" style="margin:0">🎨 Customize Design</span>
    <span class="collapsible-arrow">▼</span>
  </div>
  <div class="collapsible-body">
    <div style="margin-bottom:12px">
      <div class="design-section-title">Dot Style</div>
      <div class="dot-styles">
        <button class="dot-style-option active" data-dot-style="square" title="Square">
          ${QRDesign.DOT_STYLE_SVGS.square}
        </button>
        <button class="dot-style-option" data-dot-style="rounded" title="Rounded">
          ${QRDesign.DOT_STYLE_SVGS.rounded}
        </button>
        <button class="dot-style-option" data-dot-style="dots" title="Dots">
          ${QRDesign.DOT_STYLE_SVGS.dots}
        </button>
        <button class="dot-style-option" data-dot-style="smooth" title="Smooth">
          ${QRDesign.DOT_STYLE_SVGS.smooth}
        </button>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <div class="design-section-title">Eye Style</div>
      <div class="eye-styles">
        <button class="eye-style-option active" data-eye-style="square" title="Square">
          ${QRDesign.EYE_STYLE_SVGS.square}
        </button>
        <button class="eye-style-option" data-eye-style="rounded" title="Rounded">
          ${QRDesign.EYE_STYLE_SVGS.rounded}
        </button>
        <button class="eye-style-option" data-eye-style="circle" title="Circle">
          ${QRDesign.EYE_STYLE_SVGS.circle}
        </button>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <div class="design-section-title">Colors</div>
      <div class="color-row">
        <span class="color-row-label">Foreground</span>
        <label class="color-swatch"><input type="color" id="fg-color-picker" value="#000000"></label>
        <input type="text" class="color-hex-input" id="fg-color-hex" value="#000000" maxlength="7" placeholder="#000000">
      </div>
      <div class="color-row">
        <span class="color-row-label">Background</span>
        <label class="color-swatch" style="background:#fff;border-color:#e5e7eb"><input type="color" id="bg-color-picker" value="#ffffff"></label>
        <input type="text" class="color-hex-input" id="bg-color-hex" value="#ffffff" maxlength="7" placeholder="#ffffff">
      </div>
    </div>
    <div style="margin-bottom:12px">
      <div class="design-section-title">Error Correction</div>
      <div class="ec-options">
        <button class="ec-option" data-ec="L" title="Low — 7%">L</button>
        <button class="ec-option active" data-ec="M" title="Medium — 15%">M</button>
        <button class="ec-option" data-ec="Q" title="Quartile — 25%">Q</button>
        <button class="ec-option" data-ec="H" title="High — 30%">H</button>
      </div>
      <div class="form-hint">Higher = more reliable, larger QR</div>
    </div>
    <div>
      <div class="design-section-title">Logo (optional)</div>
      <div id="logo-zone" class="logo-upload-zone">
        <div>📁 Upload logo</div>
        <div style="font-size:11px;color:var(--text-3);margin-top:4px">PNG, JPG, SVG — free</div>
      </div>
      <input type="file" id="logo-input" accept="image/*" style="display:none">
      <div id="logo-preview-wrap" class="logo-preview-wrap" style="display:none">
        <img id="logo-preview-img" class="logo-preview" alt="Logo">
        <div>
          <div class="slider-wrap">
            <input type="range" id="logo-size-slider" min="15" max="40" value="25">
            <span class="slider-val" id="logo-size-val">25%</span>
          </div>
          <button class="remove-logo-btn" id="remove-logo-btn">✕ Remove</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
  }

  function buildDownloadPanelHTML() {
    return `
<div class="download-options">
  <div class="download-size-picker">
    <button class="size-option" data-size="512">512px</button>
    <button class="size-option active" data-size="1024">1024px</button>
    <button class="size-option" data-size="2048">2048px</button>
  </div>
  <button class="dl-btn-primary" id="dl-png">⬇ Download PNG</button>
  <button class="dl-btn-secondary" id="dl-svg">⬇ Download SVG (Vector)</button>
  <button class="dl-btn-secondary" id="dl-copy">📋 Copy to Clipboard</button>
</div>`;
  }

  function buildNavHTML(activePage) {
    const links = [
      { href: 'index.html', label: 'All Types' },
      { href: 'url.html', label: 'URL' },
      { href: 'whatsapp.html', label: 'WhatsApp' },
      { href: 'upi.html', label: 'UPI Payment' },
      { href: 'wifi.html', label: 'WiFi' },
      { href: 'vcard.html', label: 'vCard' },
      { href: 'scanner.html', label: '📷 Scanner' },
      { href: 'bulk.html', label: 'Bulk' },
    ];
    return `<nav class="nav">
  <a href="index.html" class="nav-logo">⚡ QRMaker</a>
  <div class="nav-links">
    ${links.map(l => `<a href="${l.href}" class="nav-link${activePage===l.href?' active':''}">${l.label}</a>`).join('')}
  </div>
  <a href="upi.html" class="nav-cta">🇮🇳 UPI QR</a>
</nav>`;
  }

  function buildFooterHTML() {
    return `<footer class="footer">
  <div class="footer-inner">
    <div>
      <div class="footer-col-title">QR Types</div>
      <ul class="footer-links">
        <li><a href="url.html">URL / Website QR</a></li>
        <li><a href="whatsapp.html">WhatsApp QR</a></li>
        <li><a href="upi.html">UPI Payment QR</a></li>
        <li><a href="wifi.html">WiFi QR</a></li>
        <li><a href="vcard.html">Business Card QR</a></li>
        <li><a href="location.html">Location QR</a></li>
        <li><a href="event.html">Event QR</a></li>
      </ul>
    </div>
    <div>
      <div class="footer-col-title">🇮🇳 India Tools</div>
      <ul class="footer-links">
        <li><a href="upi.html">GPay QR Code</a></li>
        <li><a href="upi.html">PhonePe QR Code</a></li>
        <li><a href="upi.html">Paytm QR Code</a></li>
        <li><a href="whatsapp.html">WhatsApp Business QR</a></li>
        <li><a href="restaurant.html">Restaurant Menu QR</a></li>
        <li><a href="bulk.html">Bulk QR Generator</a></li>
      </ul>
    </div>
    <div>
      <div class="footer-col-title">Free Tools</div>
      <ul class="footer-links">
        <li><a href="scanner.html">QR Scanner</a></li>
        <li><a href="bulk.html">Bulk Generator</a></li>
        <li><a href="social.html">Social Media QR</a></li>
        <li><a href="sms.html">SMS QR</a></li>
        <li><a href="email.html">Email QR</a></li>
        <li><a href="text.html">Text QR</a></li>
      </ul>
    </div>
    <div>
      <div class="footer-col-title">QRMaker</div>
      <ul class="footer-links">
        <li><a href="index.html">Home</a></li>
        <li><a href="scanner.html">QR Scanner</a></li>
        <li><a href="tests/test-runner.html">Browser Test</a></li>
      </ul>
      <div style="margin-top:1rem;font-size:11px;color:var(--text-3)">
        🔒 No signup required<br>
        No watermark. 100% Free.<br>
        Works offline after first load.
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© 2024 QRMaker.in — Free QR Code Generator</span>
    <span>Made with ❤️ for India</span>
  </div>
</footer>`;
  }

  return {
    el, setText, setHTML, show, hide, showEl, hideEl,
    showToast, copyToClipboard, debounce,
    isValidURL, isValidUPI, isValidPhone, isValidEmail, formatUPIId,
    parseCSV, generateFilename,
    initFAQ, initTabs,
    createQRState, renderQR,
    wireDesignPanel, wireDownloads,
    buildDesignPanelHTML, buildDownloadPanelHTML, buildNavHTML, buildFooterHTML,
  };
})();

window.QBUtils = QBUtils;
