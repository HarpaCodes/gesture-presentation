"""
gesture_client.py — Standalone MediaPipe gesture detector
Run this alongside Flask to get gesture control from your terminal/desktop.

Requirements:
    pip install mediapipe opencv-python requests

Usage:
    python gesture_client.py
"""

import cv2
import requests
import time
import sys

try:
    import mediapipe as mp
except ImportError:
    print("ERROR: mediapipe not installed. Run: pip install mediapipe")
    sys.exit(1)

# ─── Config ──────────────────────────────────────────────────────────────────
FLASK_URL        = "http://localhost:5000"
GESTURE_ENDPOINT = f"{FLASK_URL}/gesture"
HOLD_THRESHOLD   = 0.6   # seconds to hold gesture
COOLDOWN         = 1.0   # seconds between triggers
CAM_INDEX        = 0     # change if webcam is not at index 0

# ─── MediaPipe Setup ──────────────────────────────────────────────────────────
mp_hands    = mp.solutions.hands
mp_drawing  = mp.solutions.drawing_utils
mp_styles   = mp.solutions.drawing_styles


# ─── Helpers ─────────────────────────────────────────────────────────────────
def tip_y(lm, idx): return lm.landmark[idx].y
def pip_y(lm, idx): return lm.landmark[idx].y
def is_up(lm, tip_i, pip_i): return tip_y(lm, tip_i) < pip_y(lm, pip_i)

def dist(lm, a, b):
    la, lb = lm.landmark[a], lm.landmark[b]
    return ((la.x-lb.x)**2 + (la.y-lb.y)**2) ** 0.5

# Finger tip / pip indices
TIPS = {'index':8, 'middle':12, 'ring':16, 'pinky':20}
PIPS = {'index':6, 'middle':10, 'ring':14, 'pinky':18}


def recognize_gesture(hand_landmarks):
    lm = hand_landmarks
    index_up  = is_up(lm, 8, 6)
    middle_up = is_up(lm, 12, 10)
    ring_up   = is_up(lm, 16, 14)
    pinky_up  = is_up(lm, 20, 18)

    # Pinch
    if dist(lm, 4, 8) < 0.06:
        return 'pinch'

    # Fist
    if not index_up and not middle_up and not ring_up and not pinky_up:
        return 'fist'

    # Open palm
    if index_up and middle_up and ring_up and pinky_up:
        return 'palm'

    # 1 finger → next
    if index_up and not middle_up and not ring_up and not pinky_up:
        return 'next'

    # 2 fingers → prev
    if index_up and middle_up and not ring_up and not pinky_up:
        return 'prev'

    # Index pointing
    if index_up:
        return 'point'

    return 'unknown'


def send_gesture(gesture):
    try:
        r = requests.post(GESTURE_ENDPOINT,
                          json={"gesture": gesture}, timeout=0.5)
        data = r.json()
        if data.get("changed"):
            print(f"  ✓ Slide → {data['current_slide']+1}  locked={data['locked']}")
    except Exception as e:
        print(f"  ✗ Server unreachable: {e}")


# ─── Main loop ────────────────────────────────────────────────────────────────
def main():
    cap = cv2.VideoCapture(CAM_INDEX)
    if not cap.isOpened():
        print(f"Cannot open camera {CAM_INDEX}")
        sys.exit(1)

    print("=" * 50)
    print("  GestureSlide Desktop Client")
    print(f"  Flask URL : {FLASK_URL}")
    print("  Press  Q  to quit")
    print("=" * 50)

    last_gesture   = None
    gesture_start  = time.time()
    last_trigger   = 0.0

    with mp_hands.Hands(
        max_num_hands=1,
        model_complexity=1,
        min_detection_confidence=0.7,
        min_tracking_confidence=0.6
    ) as hands:

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame = cv2.flip(frame, 1)
            rgb   = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = hands.process(rgb)

            gesture = "none"
            if results.multi_hand_landmarks:
                hl = results.multi_hand_landmarks[0]
                mp_drawing.draw_landmarks(
                    frame, hl, mp_hands.HAND_CONNECTIONS,
                    mp_styles.get_default_hand_landmarks_style(),
                    mp_styles.get_default_hand_connections_style()
                )
                gesture = recognize_gesture(hl)

            now = time.time()

            # Gesture hold logic
            if gesture != last_gesture:
                last_gesture  = gesture
                gesture_start = now
            elif gesture in ('next', 'prev', 'fist'):
                hold = now - gesture_start
                cooldown_ok = (now - last_trigger) >= COOLDOWN
                if hold >= HOLD_THRESHOLD and cooldown_ok:
                    last_trigger  = now
                    gesture_start = now
                    print(f"  Gesture: {gesture.upper()}")
                    send_gesture(gesture)

            # HUD overlay
            color = (0, 212, 255) if gesture not in ('none','unknown') else (80, 80, 80)
            cv2.putText(frame, f"Gesture: {gesture.upper()}",
                        (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)

            if gesture in ('next', 'prev', 'fist'):
                hold_pct = min((now - gesture_start) / HOLD_THRESHOLD, 1.0)
                bar_w    = int(hold_pct * 200)
                cv2.rectangle(frame, (10, 50), (210, 64), (40,40,40), -1)
                cv2.rectangle(frame, (10, 50), (10+bar_w, 64), (0,212,255), -1)
                cv2.putText(frame, "Hold...", (215, 63),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180,180,180), 1)

            cv2.imshow("GestureSlide Client  [Q to quit]", frame)
            if cv2.waitKey(5) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()
    print("Gesture client stopped.")


if __name__ == '__main__':
    main()
