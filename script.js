class Bin {
    constructor(id, name, threshold = 80) {
        this.id = id;
        this.name = name;
        this.fillLevel = 0;
        this.batteryLevel = 100;
        this.temperature = 25;
        this.threshold = threshold;
        this.alertSent = false;
        this.lidOpen = false;
        this.proximityDistance = 100;
        this.history = [];
    }

    tick(speed, weather = 'sunny') {
        if (this.fillLevel < 100) {
            let fillFactor = weather === 'rainy' ? 1.5 : 1.0;
            this.fillLevel = Math.min(100, this.fillLevel + speed * (0.2 + Math.random() * 0.3) * fillFactor);
            this.batteryLevel = Math.max(0, this.batteryLevel - 0.005);
            
            let tempBase = weather === 'sunny' ? 28 : 18;
            this.temperature += (tempBase - this.temperature) * 0.1 + (Math.random() - 0.5) * 0.2;
        }
        
        const pct = Math.round(this.fillLevel);
        this.history.push({ time: getSimTime(), val: pct });
        if (this.history.length > 20) this.history.shift();

        return this.checkAlerts();
    }

    checkAlerts() {
        if (this.fillLevel >= this.threshold && !this.alertSent) {
            this.alertSent = true;
            return { type: 'alert', msg: `Bin #${this.id} (${this.name}) reached ${this.threshold}% threshold!` };
        }
        if (this.fillLevel >= 100) {
            return { type: 'overflow', msg: `Bin #${this.id} is FULL!` };
        }
        return null;
    }

    empty() {
        this.fillLevel = 0;
        this.alertSent = false;
    }
}

let bins = [new Bin(1, "Main Entrance")];
let running = false;
let simInterval = null;
let simSeconds = 0;
const startHour = 9, startMin = 0;
let darkMode = false;
let chartInstance = null;
const BIN_DEPTH_CM = 30;
const ADMIN_PHONE = "+2347031447933";

// DOM Elements
const binsContainer = document.getElementById('bins-container');
const logEl = document.getElementById('log');
const notifList = document.getElementById('notif-list');
const smsList = document.getElementById('sms-list');
const lastSmsEl = document.getElementById('last-sms');
const phoneTimeEl = document.getElementById('phone-time');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const firmwareCodeEl = document.getElementById('firmware-code');

// Utils
function getSimTime() {
    let total = startMin + simSeconds;
    let h = (startHour + Math.floor(total / 60)) % 24;
    let m = total % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function addLog(msg, type = 'info') {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const labels = { info: 'INFO', warn: 'WARN', danger: 'ALERT', success: 'OK' };
    entry.innerHTML = `<span class="log-time">${getSimTime()}</span><span class="log-tag tag-${type}">${labels[type] || 'INFO'}</span><span class="log-msg">${msg}</span>`;
    logEl.prepend(entry);
}

function addNotif(title, body) {
    const empty = notifList.querySelector('div[style*="No notifications"]');
    if (empty) empty.remove();
    const n = document.createElement('div');
    n.className = 'notif';
    n.innerHTML = `<div class="notif-header"><span class="notif-app">SmartBin Pro</span><span class="notif-time">${getSimTime()}</span></div><div class="notif-title">${title}</div><div class="notif-body">${body}</div>`;
    notifList.prepend(n);

    // Real Browser Notification
    if (Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            icon: "favicon.svg"
        });
    }
}

function requestNotificationPermission() {
    if ("Notification" in window) {
        Notification.requestPermission();
    }
}

function addSMS(msg) {
    const b = document.createElement('div');
    b.className = 'sms-bubble';
    b.innerHTML = `<div class="sms-text"><span style="font-size:9px;opacity:0.6;display:block">To: ${ADMIN_PHONE}</span>${msg}</div><div class="sms-time">${getSimTime()}</div>`;
    smsList.prepend(b);
    lastSmsEl.textContent = getSimTime();
}

function clearLogs() {
    logEl.innerHTML = '';
    saveState();
}

function getBinColor(pct) {
    if (pct < 50) return '#10b981';
    if (pct < 80) return '#f59e0b';
    return '#ef4444';
}

// Logic
function updateDisplay() {
    bins.forEach((bin, index) => {
        const pct = Math.round(bin.fillLevel);
        const fillEl = document.getElementById(`bin-fill-${index}`);
        const pctEl = document.getElementById(`fill-pct-${index}`);
        const distEl = document.getElementById(`dist-val-${index}`);
        const batteryEl = document.getElementById(`battery-val-${index}`);
        const lidEl = document.getElementById(`lid-${index}`);
        const mapDot = document.getElementById(`map-dot-${index}`);

        if (fillEl) {
            fillEl.style.height = pct + '%';
            fillEl.style.backgroundColor = getBinColor(pct);
        }
        if (pctEl) pctEl.textContent = pct + '%';
        if (distEl) distEl.textContent = (BIN_DEPTH_CM * (1 - pct/100)).toFixed(1) + ' cm';
        if (batteryEl) batteryEl.textContent = Math.round(bin.batteryLevel) + '%';
        
        if (mapDot) mapDot.setAttribute('fill', getBinColor(pct));

        // Lid animation
        if (bin.lidOpen || pct >= 90) {
            lidEl.style.transform = 'rotateX(-25deg) translateY(-5px)';
        } else {
            lidEl.style.transform = '';
        }
    });

    phoneTimeEl.textContent = getSimTime();
    updateChart();
    updateFirmwareCode();
}

function tick() {
    if (!running) return;
    simSeconds++;
    const speed = parseInt(document.getElementById('speed').value);
    const weather = document.getElementById('weather-select').value;
    
    bins.forEach(bin => {
        const alert = bin.tick(speed, weather);
        if (alert) {
            addLog(alert.msg, alert.type === 'alert' ? 'warn' : 'danger');
            if (alert.type === 'alert') {
                addNotif(`Collection Needed: ${bin.name}`, `Level: ${Math.round(bin.fillLevel)}% - Action required.`);
                addSMS(`IOT-ALERT: ${bin.name} is ${Math.round(bin.fillLevel)}% full. Route optimization triggered.`);
                playAlert();
            }
        }
    });

    updateDisplay();
}

function startSim() {
    running = true;
    btnStart.style.display = 'none';
    btnPause.style.display = 'inline-block';
    if (!simInterval) simInterval = setInterval(tick, 500);
    addLog('System Monitoring Online', 'success');
}

function pauseSim() {
    running = !running;
    btnPause.textContent = running ? 'Pause' : 'Resume';
    addLog(running ? 'System Resumed' : 'System Paused', 'info');
}

function emptyAllBins() {
    bins.forEach(bin => bin.empty());
    addLog('All bins emptied by sanitation crew', 'success');
    addNotif('Collection Complete', 'All reported bins have been cleared.');
    updateDisplay();
    saveState();
}

function resetSim() {
    clearInterval(simInterval);
    simInterval = null;
    running = false;
    simSeconds = 0;
    bins = [new Bin(1, "Main Entrance")];
    renderBins();
    updateDisplay();
    logEl.innerHTML = '';
    notifList.innerHTML = '<div style="font-size:11px;color:var(--color-text-tertiary);text-align:center;padding:20px 0">No notifications</div>';
    smsList.innerHTML = '';
    btnStart.style.display = 'inline-block';
    btnPause.style.display = 'none';
    addLog('System Hardware Reset', 'danger');
    saveState();
}

function updateWeather() {
    const weather = document.getElementById('weather-select').value;
    addLog(`Weather changed to ${weather.toUpperCase()}`, 'info');
    if (weather === 'rainy') {
        addNotif('Weather Warning', 'Heavy rain detected. Sensors calibrated for moisture.');
    }
}

function addBin() {
    if (bins.length >= 3) {
        alert("Maximum demo bins reached.");
        return;
    }
    const id = bins.length + 1;
    const names = ["Main Entrance", "Cafeteria", "Parking Lot"];
    bins.push(new Bin(id, names[id-1] || `Zone ${id}`));
    renderBins();
    updateDisplay();
    addLog(`New IoT Node connected: Bin #${id}`, 'success');
    
    // Show map element
    const dot = document.getElementById(`map-dot-${id-1}`);
    const text = document.getElementById(`map-text-${id-1}`);
    if (dot) dot.style.display = 'block';
    if (text) text.style.display = 'block';
    saveState();
}

function renderBins() {
    binsContainer.innerHTML = '';
    bins.forEach((bin, i) => {
        const card = document.createElement('div');
        card.className = 'bin-card' + (i === 0 ? ' active' : '');
        card.id = `bin-${bin.id}-card`;
        card.innerHTML = `
            <div class="bin-card-header">
                <span class="bin-name">Bin #${bin.id} (${bin.name})</span>
                <span class="bin-status-tag">Online</span>
            </div>
            <div class="bin-wrap">
                <div class="bin-scene" onmouseenter="onMouseEnterBin(${i})" onmouseleave="onMouseLeaveBin(${i})">
                    <div class="bin-base">
                        <div class="bin-lid" id="lid-${i}">
                            <svg width="110" height="14" viewBox="0 0 110 14"><rect x="0" y="0" width="110" height="14" rx="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
                        </div>
                        <div class="bin-top"></div>
                        <div class="bin-outer">
                            <div class="bin-fill" id="bin-fill-${i}"></div>
                            <div class="sensor-beam" id="sensor-beam-${i}" style="height: 95%"></div>
                            <div class="sensor-dot"></div>
                        </div>
                    </div>
                </div>
                <div class="fill-pct" id="fill-pct-${i}">0%</div>
            </div>
            <div class="stat-grid">
                <div class="stat-mini">
                    <span class="stat-mini-val" id="dist-val-${i}">30.0 cm</span>
                    <span class="stat-mini-label">Distance</span>
                </div>
                <div class="stat-mini">
                    <span class="stat-mini-val" id="battery-val-${i}">100%</span>
                    <span class="stat-mini-label">Battery</span>
                </div>
            </div>
        `;
        binsContainer.appendChild(card);
    });
}

function onMouseEnterBin(index) {
    if (bins[index]) {
        bins[index].lidOpen = true;
        updateDisplay();
    }
}

function onMouseLeaveBin(index) {
    if (bins[index]) {
        bins[index].lidOpen = false;
        updateDisplay();
    }
}

function updateChart() {
    const ctx = document.getElementById('fillChart').getContext('2d');
    const datasets = bins.map((bin, i) => ({
        label: bin.name,
        data: bin.history.map(h => h.val),
        borderColor: i === 0 ? '#3b82f6' : (i === 1 ? '#10b981' : '#f59e0b'),
        tension: 0.4,
        fill: false
    }));

    if (!chartInstance) {
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: bins[0].history.map(h => h.time),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { min: 0, max: 100 } },
                plugins: { legend: { position: 'bottom' } }
            }
        });
    } else {
        chartInstance.data.labels = bins[0].history.map(h => h.time);
        chartInstance.data.datasets = datasets;
        chartInstance.update('none');
    }
}

function updateFirmwareCode() {
    const thresh = document.getElementById('threshold').value;
    const code = `
#include <WiFi.h>
#include <HTTPClient.h>

const int TRIG_PIN = 5;
const int ECHO_PIN = 18;
const float DISTANCE_THRESHOLD = ${thresh}.0; // Percent full

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
}

void loop() {
  long duration;
  float distance;
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  duration = pulseIn(ECHO_PIN, HIGH);
  distance = duration * 0.034 / 2;
  
  float fillPercent = 100 * (1 - (distance / 30.0));
  
  if (fillPercent >= DISTANCE_THRESHOLD) {
    sendCloudAlert(fillPercent);
  }
  
  delay(5000); // 5s interval
}

void sendCloudAlert(float pct) {
  // AT command logic for SIM800L
  Serial.println("AT+CMGF=1"); // Set SMS mode
  delay(100);
  Serial.println("AT+CMGS=\"${ADMIN_PHONE}\"");
  delay(100);
  Serial.print("ALERT: Bin full at ");
  Serial.print(pct);
  Serial.println("%");
  Serial.write(26); // Ctrl+Z to send
}
    `;
    firmwareCodeEl.textContent = code.trim();
}

function copyFirmware() {
    navigator.clipboard.writeText(firmwareCodeEl.textContent);
    alert("Firmware code copied to clipboard!");
}

function playAlert() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 800;
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
}

function toggleDarkMode() {
    darkMode = !darkMode;
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    saveState();
}

function exportData() {
    const data = {
        timestamp: new Date().toISOString(),
        bins: bins.map(b => ({ name: b.name, level: b.fillLevel, history: b.history }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smart_bin_data.json';
    a.click();
}

// Persistence
function saveState() {
    const state = {
        bins: bins.map(b => ({
            id: b.id,
            name: b.name,
            fillLevel: b.fillLevel,
            batteryLevel: b.batteryLevel,
            threshold: b.threshold,
            history: b.history
        })),
        darkMode,
        speed: document.getElementById('speed').value,
        threshold: document.getElementById('threshold').value,
        simSeconds,
        logs: logEl.innerHTML
    };
    localStorage.setItem('smartBinState', JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem('smartBinState');
    if (!saved) return;
    try {
        const state = JSON.parse(saved);
        
        // Restore bins
        bins = state.bins.map(bData => {
            const b = new Bin(bData.id, bData.name, bData.threshold);
            b.fillLevel = bData.fillLevel;
            b.batteryLevel = bData.batteryLevel;
            b.history = bData.history || [];
            return b;
        });

        // Restore settings
        darkMode = state.darkMode;
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
        document.getElementById('speed').value = state.speed || 3;
        document.getElementById('threshold').value = state.threshold || 80;
        document.getElementById('speed-out').textContent = (state.speed || 3) + 'x';
        document.getElementById('thresh-out').textContent = (state.threshold || 80) + '%';
        simSeconds = state.simSeconds || 0;
        logEl.innerHTML = state.logs || '';

        // Show map markers for extra bins
        bins.forEach((bin, i) => {
            if (i > 0) {
                const dot = document.getElementById(`map-dot-${i}`);
                const text = document.getElementById(`map-text-${i}`);
                if (dot) dot.style.display = 'block';
                if (text) text.style.display = 'block';
            }
        });

        renderBins();
        updateDisplay();
    } catch (e) {
        console.error("Failed to load state", e);
    }
}

// Sliders output
document.getElementById('speed').oninput = e => {
    document.getElementById('speed-out').textContent = e.target.value + 'x';
    saveState();
};
document.getElementById('threshold').oninput = e => {
    document.getElementById('thresh-out').textContent = e.target.value + '%';
    updateFirmwareCode();
    saveState();
};

// Init
window.onload = () => {
    loadState();
    requestNotificationPermission();
    renderBins();
    updateDisplay();
    addLog('System Core v2.1 (Persistent) Initialized', 'success');
};