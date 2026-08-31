(() => {
  const AIM_RANGE_DEG = 45; // tilt/turn needed from center to reach the -1..1 edge
  const SEND_INTERVAL_MS = 1000 / 30;

  // Optional button-press SFX; dropped in under public/assets/. Missing
  // files just fail silently, same as the game screen's sound effects.
  const SFX_PATHS = {
    uiClick: 'assets/sfx/ui/click.mp3',
    uiConfirm: 'assets/sfx/ui2/confirm.mp3',
  };
  function playSfx(key) {
    const src = SFX_PATHS[key];
    if (!src) return;
    const audio = new Audio(src);
    audio.volume = 0.7;
    audio.play().catch(() => {});
  }

  const body = document.body;
  const startBtn = document.getElementById('startBtn');
  const calibrateBtn = document.getElementById('calibrateBtn');
  const resetBtn = document.getElementById('resetBtn');
  const fireBtn = document.getElementById('fireBtn');
  const statusLine = document.getElementById('statusLine');
  const playerBadge = document.getElementById('playerBadge');

  let ws = null;
  let latest = { alpha: 0, beta: 0 };
  let baseline = null;
  let sendTimer = null;

  function setScreen(name) {
    body.dataset.screen = name;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // Shortest signed distance from b to a on a 0-360 circle.
  function angleDiff(a, b) {
    let diff = a - b;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return diff;
  }

  function onOrientation(e) {
    if (e.alpha === null || e.beta === null) return;
    latest.alpha = e.alpha;
    latest.beta = e.beta;
  }

  function calibrate() {
    baseline = { alpha: latest.alpha, beta: latest.beta };
  }

  function currentAim() {
    if (!baseline) return { x: 0, y: 0 };
    const turn = angleDiff(latest.alpha, baseline.alpha); // + = turned right
    // Tilting the top of the phone back (as if raising the barrel) lowers
    // beta; treat that as aiming up (+y). Flip the sign here if it feels
    // inverted once tested on a real device.
    const tilt = baseline.beta - latest.beta; // + = tilted up
    return {
      x: clamp(turn / AIM_RANGE_DEG, -1, 1),
      y: clamp(tilt / AIM_RANGE_DEG, -1, 1),
    };
  }

  function startSending() {
    stopSending();
    sendTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const aim = currentAim();
      ws.send(JSON.stringify({ type: 'aim', x: aim.x, y: aim.y }));
    }, SEND_INTERVAL_MS);
  }

  function stopSending() {
    if (sendTimer) {
      clearInterval(sendTimer);
      sendTimer = null;
    }
  }

  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'hello', role: 'controller' }));
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'assigned') {
        playerBadge.textContent = `PLAYER ${msg.player}`;
      } else if (msg.type === 'full') {
        stopSending();
        setScreen('full');
      }
    });

    ws.addEventListener('close', () => {
      stopSending();
      statusLine.textContent = 'サーバーとの接続が切れました。再読み込みしてください';
    });
  }

  function fire() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'fire' }));
    }
    if (navigator.vibrate) navigator.vibrate(50);
  }

  async function requestOrientationPermission() {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      const result = await DeviceOrientationEvent.requestPermission();
      return result === 'granted';
    }
    return true; // Android / browsers that don't gate the API behind permission
  }

  startBtn.addEventListener('click', async () => {
    playSfx('uiClick');
    statusLine.textContent = 'センサーを起動しています…';
    let granted = false;
    try {
      granted = await requestOrientationPermission();
    } catch {
      granted = false;
    }

    if (!granted) {
      statusLine.textContent = 'センサーの利用が許可されませんでした';
      return;
    }

    window.addEventListener('deviceorientation', onOrientation);
    connectWS();
    setScreen('calibrate');
  });

  calibrateBtn.addEventListener('click', () => {
    playSfx('uiConfirm');
    calibrate();
    startSending();
    setScreen('play');
  });

  resetBtn.addEventListener('click', () => {
    playSfx('uiClick');
    calibrate();
  });

  fireBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    fireBtn.classList.add('pressed');
    fire();
  }, { passive: false });

  fireBtn.addEventListener('touchend', () => {
    fireBtn.classList.remove('pressed');
  });

  fireBtn.addEventListener('mousedown', () => {
    fireBtn.classList.add('pressed');
    fire();
  });

  fireBtn.addEventListener('mouseup', () => {
    fireBtn.classList.remove('pressed');
  });

  // Disable double-tap-to-zoom (viewport user-scalable=no doesn't stop it
  // on every browser).
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 350) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener('gesturestart', (e) => e.preventDefault());
})();
