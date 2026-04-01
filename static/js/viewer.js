/**
 * viewer.js — Slide Viewer Controller
 * Handles: slide display, thumbnails, gesture UI updates, keyboard nav
 */

// ─── State ──────────────────────────────────────────────────────────────────
let appState = {
  slides: [],
  currentSlide: 0,
  totalSlides: 0,
  locked: false,
  cameraRunning: false,
  lastGesture: 'none',
};

// ─── On page load ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setInterval(pollState, 1500); // keep in sync with Flask
});

// ─── Load initial state from Flask ───────────────────────────────────────────
function loadState() {
  fetch('/state')
    .then(r => r.json())
    .then(data => {
      appState.slides = data.slides || [];
      appState.totalSlides = data.total_slides || 0;
      appState.locked = data.locked || false;
      appState.currentSlide = data.current_slide || 0;

      document.getElementById('presName').textContent =
        data.presentation_name || 'Presentation';

      buildThumbnails();
      renderSlide(appState.currentSlide);
      updateStatusUI();
    })
    .catch(() => {
      showFallback(0, 'No Presentation', 'Upload a file first');
    });
}

// ─── Poll state for sync ─────────────────────────────────────────────────────
function pollState() {
  fetch('/state')
    .then(r => r.json())
    .then(data => {
      if (data.current_slide !== appState.currentSlide) {
        appState.currentSlide = data.current_slide;
        renderSlide(appState.currentSlide);
      }
      if (data.locked !== appState.locked) {
        appState.locked = data.locked;
        updateLockState(data.locked);
      }
    })
    .catch(() => {});
}

// ─── Render a slide ──────────────────────────────────────────────────────────
function renderSlide(idx) {
  const img   = document.getElementById('slideImg');
  const fallback = document.getElementById('slideFallback');
  const stage = document.getElementById('slideStage');

  appState.currentSlide = idx;

  // Update counters
  document.getElementById('curSlide').textContent = idx + 1;
  document.getElementById('totSlide').textContent = appState.totalSlides;
  document.getElementById('statSlide').textContent = idx + 1;
  document.getElementById('statTotal').textContent = appState.totalSlides;

  // Animate
  stage.classList.remove('slide-anim');
  void stage.offsetWidth;
  stage.classList.add('slide-anim');

  const slidePath = appState.slides[idx];

  if (slidePath && !slidePath.endsWith('.placeholder')) {
    img.style.display = 'block';
    fallback.style.display = 'none';
    img.src = '/static/' + slidePath + '?t=' + Date.now();
    img.onerror = () => {
      img.style.display = 'none';
      showFallback(idx, `Slide ${idx + 1}`, slidePath);
    };
  } else {
    img.style.display = 'none';
    showFallback(idx, `Slide ${idx + 1}`, 'Demo Mode');
  }

  // Update thumbnails
  document.querySelectorAll('.thumb').forEach((t, i) => {
    t.classList.toggle('active', i === idx);
  });
}

// ─── Fallback colored slide ───────────────────────────────────────────────────
const fallbackColors = ['#1a1a2e','#0f3460','#533483','#16213e','#0d1520','#1b262c'];
const fallbackAccents = ['#00d4ff','#e94560','#ffffff','#00ff88','#e94560','#00d4ff'];

function showFallback(idx, title, sub) {
  const fallback = document.getElementById('slideFallback');
  fallback.style.display = 'flex';
  fallback.style.background =
    `linear-gradient(135deg, ${fallbackColors[idx % fallbackColors.length]}, #0d1520)`;
  document.getElementById('fallbackNum').textContent = idx + 1;
  document.getElementById('fallbackTitle').textContent = title;
  document.getElementById('fallbackTitle').style.color =
    fallbackAccents[idx % fallbackAccents.length];
  document.getElementById('fallbackSub').textContent = sub;
}

// ─── Build thumbnail strip ────────────────────────────────────────────────────
function buildThumbnails() {
  const strip = document.getElementById('thumbStrip');
  strip.innerHTML = '';

  for (let i = 0; i < appState.totalSlides; i++) {
    const thumb = document.createElement('div');
    thumb.className = 'thumb' + (i === appState.currentSlide ? ' active' : '');
    thumb.onclick = () => { gotoSlide(i); };

    const slidePath = appState.slides[i];
    if (slidePath && !slidePath.endsWith('.placeholder')) {
      const img = document.createElement('img');
      img.src = '/static/' + slidePath;
      img.alt = `Slide ${i+1}`;
      thumb.appendChild(img);
    } else {
      const col = document.createElement('div');
      col.className = 'thumb-color';
      col.style.background = fallbackColors[i % fallbackColors.length];
      col.textContent = i + 1;
      thumb.appendChild(col);
    }
    strip.appendChild(thumb);
  }
}

// ─── Slide navigation ──────────────────────────────────────────────────────────
function changeSlide(direction) {
  const endpoint = direction === 'next' ? '/slide/next' : '/slide/prev';
  fetch(endpoint, { method: 'POST' })
    .then(r => r.json())
    .then(data => {
      renderSlide(data.current_slide);
    });
}

function gotoSlide(idx) {
  fetch('/slide/goto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index: idx })
  })
    .then(r => r.json())
    .then(data => renderSlide(data.current_slide));
}

// ─── Public callback for gesture.js ───────────────────────────────────────────
window.updateSlide = function(idx) {
  renderSlide(idx);
};

window.updateLockState = function(locked) {
  appState.locked = locked;
  updateLockState(locked);
};

// ─── Lock UI ───────────────────────────────────────────────────────────────────
function updateLockState(locked) {
  const overlay  = document.getElementById('lockOverlay');
  const badge    = document.getElementById('statusBadge');
  const dot      = document.getElementById('statusDot');
  const text     = document.getElementById('statusText');
  const lockStat = document.getElementById('statLock');

  overlay.style.display = locked ? 'flex' : 'none';
  badge.style.borderColor = locked ? 'rgba(233,69,96,0.4)' : '';
  dot.style.background    = locked ? '#e94560' : '';
  text.textContent        = locked ? 'LOCKED' : 'ACTIVE';
  lockStat.textContent    = locked ? 'LOCKED' : 'OPEN';
  lockStat.style.color    = locked ? '#e94560' : '';
}

function updateStatusUI() {
  updateLockState(appState.locked);
  document.getElementById('curSlide').textContent = appState.currentSlide + 1;
  document.getElementById('totSlide').textContent = appState.totalSlides;
  document.getElementById('statSlide').textContent = appState.currentSlide + 1;
  document.getElementById('statTotal').textContent = appState.totalSlides;
}

// ─── Toggle lock via button ────────────────────────────────────────────────────
function toggleLock() {
  fetch('/toggle_lock', { method: 'POST' })
    .then(r => r.json())
    .then(data => updateLockState(data.locked));
}

// ─── Camera / MediaPipe integration ───────────────────────────────────────────
let cameraStarted = false;

function toggleCamera() {
  const btn = document.getElementById('camBtn');
  const statusEl = document.getElementById('camStatus');
  const videoEl  = document.getElementById('camVideo');
  const canvasEl = document.getElementById('camCanvas');

  if (cameraStarted) {
    stopMediaPipe(videoEl);
    cameraStarted = false;
    btn.textContent = '📷 Start Camera';
    btn.classList.remove('active');
    statusEl.textContent = 'Camera stopped';
    document.getElementById('gestureName').textContent = 'Camera off';
    return;
  }

  statusEl.textContent = 'Starting camera…';
  btn.textContent = '⏳ Starting…';
  btn.disabled = true;

  initMediaPipe(videoEl, canvasEl, onGestureDetected);

  // Give it a moment then update button regardless
  setTimeout(() => {
    cameraStarted = true;
    btn.textContent = '⏹ Stop Camera';
    btn.classList.add('active');
    btn.disabled = false;
  }, 1500);
}

// ─── Gesture callback ──────────────────────────────────────────────────────────
const gestureIdMap = {
  next:  'g-next',
  prev:  'g-prev',
  point: 'g-point',
  pinch: 'g-pinch',
  palm:  'g-palm',
};
const gestureLabelMap = {
  next:    '👍 Next',
  prev:    '✌ Previous',
  point:   '👆 Pointer',
  pinch:   '🤏 Pinch',
  palm:    '🖐 Open Palm',
  none:    'No hand',
  unknown: 'Unknown',
};

let lastActiveRow = null;

function onGestureDetected(gesture, landmarks) {
  // Update label in camera
  const nameEl = document.getElementById('gestureName');
  nameEl.textContent = gestureLabelMap[gesture] || gesture;

  // Update stat
  document.getElementById('statGesture').textContent =
    (gestureLabelMap[gesture] || gesture).replace(/^[^\s]+ /, '');

  // Highlight gesture row
  if (lastActiveRow) lastActiveRow.classList.remove('active');
  const rowId = gestureIdMap[gesture];
  if (rowId) {
    const row = document.getElementById(rowId);
    if (row) { row.classList.add('active'); lastActiveRow = row; }
  }

  // Laser pointer
  const laserDot = document.getElementById('laserDot');
  if (gesture === 'point' && landmarks) {
    const pos = getIndexPosition(landmarks);
    if (pos) {
      const stage = document.getElementById('slideStage');
      const rect  = stage.getBoundingClientRect();
      // Mirror X because video is flipped
      const x = (1 - pos.x) * rect.width;
      const y = pos.y * rect.height;
      laserDot.style.left = x + 'px';
      laserDot.style.top  = y + 'px';
      laserDot.classList.add('visible');
    }
  } else {
    laserDot.classList.remove('visible');
  }

  // Open Palm → Fullscreen slideshow
  if (gesture === 'palm') {
    if (!window._palmTriggered) {
      window._palmTriggered = true;
      toggleFullscreen();
      setTimeout(() => { window._palmTriggered = false; }, 2000);
    }
  }

  // Pinch flash effect
  if (gesture === 'pinch') {
    document.getElementById('slideStage').style.outline =
      '3px solid var(--accent2)';
    setTimeout(() =>
      document.getElementById('slideStage').style.outline = 'none', 300);
  }
}

// ─── Keyboard Navigation ────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (appState.locked) return;
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault(); changeSlide('next');
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault(); changeSlide('prev');
  }
  if (e.key === 'l' || e.key === 'L') toggleLock();
  if (e.key === 'c' || e.key === 'C') toggleCamera();
});

// ─── Fullscreen support ───────────────────────────────────────────────────────
let isFullscreen = false;

function toggleFullscreen() {
  const stage = document.getElementById('slideStage');
  if (!isFullscreen) {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    isFullscreen = true;
    stage.style.position = 'fixed';
    stage.style.inset = '0';
    stage.style.zIndex = '9999';
    stage.style.background = '#000';
    document.getElementById('slideImg').style.maxHeight = '100vh';
    document.getElementById('slideImg').style.maxWidth = '100vw';
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    isFullscreen = false;
    stage.style.position = '';
    stage.style.inset = '';
    stage.style.zIndex = '';
    stage.style.background = '';
    document.getElementById('slideImg').style.maxHeight = '';
    document.getElementById('slideImg').style.maxWidth = '';
  }
}

// Exit fullscreen on Escape
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    isFullscreen = false;
    const stage = document.getElementById('slideStage');
    stage.style.position = stage.style.inset = stage.style.zIndex = stage.style.background = '';
  }
});

// Keyboard shortcut F for fullscreen
document.addEventListener('keydown', e => {
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});
