/**
 * gesture.js — MediaPipe Hand Tracking + Gesture Recognition
 * Robust version: handles CDN load failures, multiple init strategies.
 */

// ─── Engine State ────────────────────────────────────────────────────────────
const GestureEngine = {
  hands: null,
  camera: null,
  running: false,
  lastGesture: null,
  gestureHoldStart: 0,
  gestureHoldThreshold: 600,  // ms to hold before triggering
  lastTriggerTime: 0,
  cooldownMs: 1000,
  onGesture: null,
};

// ─── Public: Start MediaPipe ─────────────────────────────────────────────────
function initMediaPipe(videoEl, canvasEl, callback) {
  GestureEngine.onGesture = callback;

  const tryInit = (attempt) => {
    if (attempt > 20) {
      console.warn('MediaPipe never became available. Falling back to camera-only mode.');
      _fallbackGetUserMedia(videoEl);
      return;
    }
    if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
      setTimeout(() => tryInit(attempt + 1), 500);
      return;
    }
    _startMediaPipe(videoEl, canvasEl);
  };

  tryInit(1);
  return true;
}

function _startMediaPipe(videoEl, canvasEl) {
  try {
    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6,
    });

    hands.onResults((results) => _processResults(results, canvasEl));
    GestureEngine.hands = hands;

    const cam = new Camera(videoEl, {
      onFrame: async () => {
        if (GestureEngine.hands) {
          await GestureEngine.hands.send({ image: videoEl });
        }
      },
      width: 320,
      height: 240,
    });

    cam.start()
      .then(() => {
        GestureEngine.camera = cam;
        GestureEngine.running = true;
        console.log('MediaPipe Hands started.');
        _updateCamStatus('Tracking hands…');
      })
      .catch((err) => {
        console.error('Camera.start() failed:', err);
        _updateCamStatus('Camera error — trying fallback');
        _fallbackGetUserMedia(videoEl);
      });

  } catch (err) {
    console.error('MediaPipe init error:', err);
    _updateCamStatus('MediaPipe error — camera only');
    _fallbackGetUserMedia(videoEl);
  }
}

function _fallbackGetUserMedia(videoEl) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    _updateCamStatus('Camera not supported');
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
    .then((stream) => {
      videoEl.srcObject = stream;
      GestureEngine.running = true;
      _updateCamStatus('Camera on (no gestures — MediaPipe CDN failed)');
    })
    .catch((err) => {
      _updateCamStatus('Camera denied: ' + err.message);
    });
}

function _updateCamStatus(msg) {
  const el = document.getElementById('camStatus');
  if (el) el.textContent = msg;
}

// ─── Process MediaPipe Results ───────────────────────────────────────────────
function _processResults(results, canvasEl) {
  canvasEl.width  = canvasEl.offsetWidth  || 280;
  canvasEl.height = canvasEl.offsetHeight || 210;
  const ctx = canvasEl.getContext('2d');
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    if (GestureEngine.lastGesture !== 'none') {
      GestureEngine.lastGesture = 'none';
      GestureEngine.gestureHoldStart = 0;
    }
    if (GestureEngine.onGesture) GestureEngine.onGesture('none', null);
    return;
  }

  const landmarks = results.multiHandLandmarks[0];

  if (typeof drawConnectors !== 'undefined' && typeof HAND_CONNECTIONS !== 'undefined') {
    drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
      color: 'rgba(0,212,255,0.6)', lineWidth: 2
    });
    drawLandmarks(ctx, landmarks, {
      color: '#e94560', lineWidth: 1, radius: 3
    });
  }

  const gesture = recognizeGesture(landmarks);
  _handleGestureLogic(gesture, landmarks);
}

// ─── Gesture Recognition ─────────────────────────────────────────────────────
function recognizeGesture(lm) {
  const fingerUp = (tipIdx, pipIdx) => lm[tipIdx].y < lm[pipIdx].y;

  const indexUp  = fingerUp(8, 6);
  const middleUp = fingerUp(12, 10);
  const ringUp   = fingerUp(16, 14);
  const pinkyUp  = fingerUp(20, 18);

  const pinchDist = _dist(lm[4], lm[8]);
  if (pinchDist < 0.07) return 'pinch';

  if (!indexUp && !middleUp && !ringUp && !pinkyUp) return 'fist';
  if (indexUp && middleUp && ringUp && pinkyUp) return 'palm';
  if (indexUp && !middleUp && !ringUp && !pinkyUp) return 'next';
  if (indexUp && middleUp && !ringUp && !pinkyUp) return 'prev';
  if (indexUp) return 'point';

  return 'unknown';
}

function _dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ─── Hold + cooldown logic ────────────────────────────────────────────────────
function _handleGestureLogic(gesture, landmarks) {
  const now = Date.now();

  if (GestureEngine.onGesture) GestureEngine.onGesture(gesture, landmarks);

  const triggerGestures = ['next', 'prev', 'fist'];
  if (!triggerGestures.includes(gesture)) return;

  if (gesture !== GestureEngine.lastGesture) {
    GestureEngine.lastGesture = gesture;
    GestureEngine.gestureHoldStart = now;
    return;
  }

  const holdMs = now - GestureEngine.gestureHoldStart;
  const cooldownOk = (now - GestureEngine.lastTriggerTime) >= GestureEngine.cooldownMs;

  if (holdMs >= GestureEngine.gestureHoldThreshold && cooldownOk) {
    GestureEngine.lastTriggerTime = now;
    GestureEngine.gestureHoldStart = now;
    _sendGestureToFlask(gesture);
  }
}

function _sendGestureToFlask(gesture) {
  fetch('/gesture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gesture }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.changed && window.updateSlide) window.updateSlide(data.current_slide);
      if (window.updateLockState) window.updateLockState(data.locked);
    })
    .catch((err) => console.warn('Gesture API error:', err));
}

function getIndexPosition(landmarks) {
  if (!landmarks) return null;
  return { x: landmarks[8].x, y: landmarks[8].y };
}

function stopMediaPipe(videoEl) {
  if (GestureEngine.camera) {
    try { GestureEngine.camera.stop(); } catch (e) {}
    GestureEngine.camera = null;
  }
  if (videoEl && videoEl.srcObject) {
    videoEl.srcObject.getTracks().forEach((t) => t.stop());
    videoEl.srcObject = null;
  }
  GestureEngine.hands = null;
  GestureEngine.running = false;
}
