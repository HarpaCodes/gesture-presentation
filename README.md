# GestureSlide — Gesture Controlled Presentation System
## Complete Setup Guide

---

## 📁 Folder Structure

```
gesture_presentation/
├── app.py                  ← Flask backend (main server)
├── gesture_client.py       ← Standalone MediaPipe desktop client
├── requirements.txt        ← Python packages
├── README.md               ← This file
├── templates/
│   ├── index.html          ← Page 1: Upload screen
│   └── viewer.html         ← Page 2: Presentation viewer
└── static/
    ├── css/
    │   └── style.css       ← All styles
    ├── js/
    │   ├── gesture.js      ← MediaPipe gesture detection (browser)
    │   └── viewer.js       ← Slide viewer controller
    ├── uploads/            ← (auto-created) Uploaded files
    └── slides/             ← (auto-created) Converted slide images
```

---

## ⚙️ Installation

### Step 1 — Install Python packages
```bash
pip install flask Pillow pdf2image
```

For PDF support, also install poppler:
- **Windows**: Download from https://github.com/oschwartz10612/poppler-windows
- **macOS**:   `brew install poppler`
- **Linux**:   `sudo apt install poppler-utils`

For PPT/PPTX support:
- **Linux/macOS**: `sudo apt install libreoffice` or `brew install --cask libreoffice`
- **Windows**: Install LibreOffice from https://www.libreoffice.org

### Step 2 — (Optional) Install for desktop gesture client
```bash
pip install mediapipe opencv-python requests
```

---

## 🚀 Running the App

### Terminal 1 — Start Flask server
```bash
cd gesture_presentation
python app.py
```
Open http://localhost:5000 in your browser.

### Terminal 2 — Start gesture client (optional, for desktop control)
```bash
python gesture_client.py
```
A window will open showing your webcam with hand tracking overlay.

---

## 🖐️ Gesture Guide

| Gesture        | Action               |
|----------------|----------------------|
| ☝ 1 Finger up  | Next slide           |
| ✌ 2 Fingers up | Previous slide       |
| ✊ Fist         | Toggle lock/unlock   |
| 👆 Index point  | Laser pointer        |
| 🤏 Pinch        | Click (highlight)    |
| 🖐 Open palm    | Idle / pause         |

**Hold gesture for ~0.6 seconds** to trigger it (prevents accidental changes).

---

## 🎮 Two Modes of Gesture Control

### Mode A — Browser-based (via Webcam in Chrome)
1. Open http://localhost:5000
2. Upload your presentation
3. In the viewer, click **"Start Camera"**
4. Allow camera access
5. Use hand gestures in front of your webcam

### Mode B — Desktop client (Python + MediaPipe)
1. Run Flask server
2. Run `python gesture_client.py` in a second terminal
3. A window shows your webcam with landmarks drawn
4. Use gestures — hold until the progress bar fills

---

## ⌨️ Keyboard Shortcuts (in viewer)

| Key              | Action         |
|------------------|----------------|
| → / Space        | Next slide     |
| ←                | Previous slide |
| L                | Toggle lock    |
| C                | Toggle camera  |

---

## 🔧 Troubleshooting

**PDF slides not converting?**
→ Install poppler (see Step 1) and try again.

**PPT/PPTX not converting?**
→ Install LibreOffice. Or convert to PDF first using PowerPoint/Google Slides.

**Camera not working in browser?**
→ Use Chrome or Edge (Firefox may block WebRTC on localhost).
→ Click "Start Camera" and allow access when prompted.

**MediaPipe not loading?**
→ You need an internet connection for the CDN scripts.
→ Check browser console (F12) for errors.

**Gesture client can't connect?**
→ Make sure `python app.py` is running on port 5000 first.

---

## 📝 How it Works

```
Browser Webcam
      ↓
MediaPipe (gesture.js)    ← runs in browser, no install needed
      ↓ detects gesture
Flask API (/gesture)      ← POST {gesture: "next"}
      ↓ updates state
Viewer polls /state       ← every 1.5 seconds
      ↓
Slide image rendered      ← from static/slides/current/
```

OR with desktop client:
```
Webcam
  ↓
gesture_client.py         ← OpenCV + MediaPipe (desktop)
  ↓ POST /gesture
Flask API (/gesture)
  ↓
Browser viewer polls
  ↓
Slide changes
```
