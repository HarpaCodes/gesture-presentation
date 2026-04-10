/**
 * whiteboard.js — Gesture-Controlled Whiteboard Module
 * Completely isolated from presentation logic.
 * Activated only when mode = 'whiteboard'.
 */

const Whiteboard = (() => {
  // ─── State ───────────────────────────────────────────────────────────────
  let canvas, ctx;
  let active = false;
  let isDrawing = false;
  let drawColor = '#00d4ff';
  let lineWidth = 4;

  // Smoothing buffer
  const SMOOTH_POINTS = 5;
  let posBuffer = [];

  // Last mirrored position on canvas
  let lastPos = null;

  // Draw activation delay (ms) to prevent false triggers
  let drawActivationTimer = null;
  let drawPending = false;

  // Rock gesture — hold timer + one-time trigger guard
  let rockHoldStart = 0;
  let rockTriggered = false;         // prevents repeat while held
  const ROCK_HOLD_DURATION = 250;    // ms before clear fires

  // Undo / Redo stacks (store ImageData snapshots)
  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 30;

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('whiteboardCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    _resizeCanvas();
    window.addEventListener('resize', _resizeCanvas);
  }

  function _resizeCanvas() {
    if (!canvas) return;
    const stage = canvas.parentElement;
    const rect = stage.getBoundingClientRect();
    // Preserve drawing across resize using temp copy
    const temp = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width  = rect.width  || stage.offsetWidth;
    canvas.height = rect.height || stage.offsetHeight;
    if (temp) ctx.putImageData(temp, 0, 0);
  }

  // ─── Mode toggle ──────────────────────────────────────────────────────────
  function enable() {
    active = true;
    canvas.style.pointerEvents = 'none'; // always non-interactive, gesture driven
    if (!canvas.width) _resizeCanvas();
  }

  function disable() {
    active = false;
    isDrawing = false;
    lastPos = null;
    posBuffer = [];
    _clearRockTimer();
  }

  // ─── Gesture Handler (called by viewer.js onGestureDetected) ──────────────
  function handleGesture(gesture, landmarks) {
    if (!active || !landmarks) {
      _stopDraw();
      return;
    }

    // Get mirrored fingertip position on canvas
    const tip = _getLandmarkPos(landmarks[8]);

    if (gesture === 'draw') {
      _clearRockTimer();
      _scheduleDraw(tip);
    } else if (gesture === 'rock') {
      _stopDraw();
      _handleRockHold();
    } else {
      _stopDraw();
      _clearRockTimer();
    }
  }

  // ─── Draw scheduling with stability delay ─────────────────────────────────
  function _scheduleDraw(tip) {
    if (isDrawing) {
      // Already drawing — continue immediately
      _continueDraw(tip);
      return;
    }
    // Not yet drawing — wait for stability delay
    if (!drawPending) {
      drawPending = true;
      drawActivationTimer = setTimeout(() => {
        drawPending = false;
        if (window.gestureCurrentMode === 'whiteboard') {
          isDrawing = true;
          lastPos = tip;
          posBuffer = [tip];
        }
      }, 220); // 220ms stability delay
    }
    // Update position in case it's tracking
    lastPos = tip;
  }

  function _stopDraw() {
    if (drawPending) {
      clearTimeout(drawActivationTimer);
      drawPending = false;
    }
    if (isDrawing) {
      _pushUndo();
      redoStack.length = 0;
    }
    isDrawing = false;
    lastPos = null;
    posBuffer = [];
  }

  function _continueDraw(tip) {
    if (!isDrawing || !tip) return;

    // Smooth: keep rolling buffer of last N positions
    posBuffer.push(tip);
    if (posBuffer.length > SMOOTH_POINTS) posBuffer.shift();
    const smooth = _average(posBuffer);

    if (!lastPos) { lastPos = smooth; return; }

    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(smooth.x, smooth.y);
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.stroke();

    lastPos = smooth;
  }

  // ─── Rock gesture hold = full clear (one-time per activation) ─────────────────
  function _handleRockHold() {
    if (rockTriggered) return; // already fired, wait for release
    const now = Date.now();
    if (rockHoldStart === 0) {
      rockHoldStart = now;
      const row = document.getElementById('g-rock');
      if (row) row.classList.add('active');
      return;
    }
    if ((now - rockHoldStart) >= ROCK_HOLD_DURATION) {
      rockTriggered = true; // lock so it won't repeat
      _clearRockTimer();
      wbClear();
    }
  }

  function _clearRockTimer() {
    rockHoldStart = 0;
    rockTriggered = false;
    const row = document.getElementById('g-rock');
    if (row) row.classList.remove('active');
  }

  // ─── Undo / Redo ─────────────────────────────────────────────────────────
  function _pushUndo() {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
  }

  function wbUndo() {
    if (!undoStack.length) return;
    redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(undoStack.pop(), 0, 0);
  }

  function wbRedo() {
    if (!redoStack.length) return;
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(redoStack.pop(), 0, 0);
  }

  // ─── Clear ────────────────────────────────────────────────────────────────
  function wbClear() {
    _pushUndo();
    redoStack.length = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Flash effect
    canvas.style.transition = 'opacity 0.1s';
    canvas.style.opacity = '0.2';
    setTimeout(() => { canvas.style.opacity = '1'; }, 150);
  }

  // ─── Save as PNG ──────────────────────────────────────────────────────────
  function wbSave() {
    // Composite: grab slide image + whiteboard
    const stage = canvas.parentElement;
    const offscreen = document.createElement('canvas');
    offscreen.width  = canvas.width;
    offscreen.height = canvas.height;
    const oc = offscreen.getContext('2d');

    // Draw slide image if visible
    const slideImg = document.getElementById('slideImg');
    if (slideImg && slideImg.style.display !== 'none' && slideImg.complete) {
      oc.drawImage(slideImg, 0, 0, offscreen.width, offscreen.height);
    }
    // Draw whiteboard on top
    oc.drawImage(canvas, 0, 0);

    const link = document.createElement('a');
    link.download = `whiteboard_${Date.now()}.png`;
    link.href = offscreen.toDataURL('image/png');
    link.click();
  }

  // ─── Color ────────────────────────────────────────────────────────────────
  function setColor(color) {
    drawColor = color;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _getLandmarkPos(lm) {
    if (!canvas || !lm) return null;
    // Mirror X because video is flipped
    return {
      x: (1 - lm.x) * canvas.width,
      y: lm.y * canvas.height,
    };
  }

  function _average(pts) {
    const s = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: s.x / pts.length, y: s.y / pts.length };
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return { init, enable, disable, handleGesture, wbUndo, wbRedo, wbClear, wbSave, setColor };
})();

// ─── Global helpers (called from HTML onclick) ────────────────────────────────
function wbUndo()  { Whiteboard.wbUndo(); }
function wbRedo()  { Whiteboard.wbRedo(); }
function wbClear() { Whiteboard.wbClear(); }
function wbSave()  { Whiteboard.wbSave(); }
function setWBColor(btn, color) {
  document.querySelectorAll('.color-dot').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  Whiteboard.setColor(color);
}

// ─── Auto-init on DOM ready ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => Whiteboard.init());
