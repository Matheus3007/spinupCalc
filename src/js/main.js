import { simulateSpinup } from './physics.js';
import { init3DViewer } from './stlViewer.js';
import Chart from 'chart.js/auto';

// --- Constants & Config ---
const COLORS = [
    '#00FF00', // Neon Green
    '#00FFFF', // Cyan
    '#FF00FF', // Magenta
    '#FFFF00', // Yellow
    '#FF5500', // Neon Orange
    '#9D00FF', // Electric Purple
    '#0088FF', // Dodger Blue
    '#FF0099'  // Hot Pink
];
let colorIdx = 0;

// charts
let rpmChart, currentChart;

// --- DOM Elements ---
const inputs = {
    simName: document.getElementById('simName'),
    kv: document.getElementById('kv'),
    voltage: document.getElementById('voltage'),
    resistance: document.getElementById('resistance'),
    escLimit: document.getElementById('escLimit'),
    reduction: document.getElementById('reduction'),
    efficiency: document.getElementById('efficiency'),
    rLong: document.getElementById('rLong'),
    rShort: document.getElementById('rShort'),
    height: document.getElementById('height'),
    cd: document.getElementById('dragCoeff'), // Changed from 'cd' to 'dragCoeff' to match user edit
    viscous: document.getElementById('viscous'),
    mass: document.getElementById('mass'),
    inertia: document.getElementById('inertia'),
};

const outputIds = {
    rpm: 'resRpmMax',
    time: 'resTime',
    tipSpeed: 'resTipSpeed',
    current: 'resCurrent'
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    init3DViewer('stl-container');
    setupEventListeners();
});

function initCharts() {
    // Shared Options for Tech Theme
    Chart.defaults.font.family = "'Courier New', Courier, monospace"; // Match CSS --font-main

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { labels: { color: '#FFFFFF', font: { family: "'Consolas', 'Monaco', monospace" } } },
            title: { display: true, color: '#00FF00', font: { size: 16 } }
        },
        scales: {
            x: {
                type: 'linear',
                grid: { color: '#333333' },
                ticks: { color: '#AAAAAA' },
                title: { display: true, text: 'Time (s)', color: '#FFFFFF' }
            },
            y: {
                grid: { color: '#333333' },
                ticks: { color: '#AAAAAA' },
                title: { display: true, color: '#FFFFFF' }
            }
        }
    };

    // RPM Chart
    const ctxRpm = document.getElementById('spinupChart').getContext('2d');
    rpmChart = new Chart(ctxRpm, {
        type: 'line',
        data: { datasets: [] },
        options: {
            ...commonOptions,
            plugins: { ...commonOptions.plugins, title: { ...commonOptions.plugins.title, text: 'Spin-Up Curve (RPM)' } },
            scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, title: { text: 'RPM' } } }
        }
    });

    // Current Chart
    const ctxCurrent = document.getElementById('currentChart').getContext('2d');
    currentChart = new Chart(ctxCurrent, {
        type: 'line',
        data: { datasets: [] },
        options: {
            ...commonOptions,
            plugins: { ...commonOptions.plugins, title: { ...commonOptions.plugins.title, text: 'Current Draw (A)' } },
            scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, title: { text: 'Current (A)' } } }
        }
    });
}

function setupEventListeners() {
    document.getElementById('btn-add').addEventListener('click', runSimulation);
    document.getElementById('btn-clear').addEventListener('click', clearCharts);

    // Auto-estimate inertia when parameters change (if inertia is 0 or user specifically requests?)
    // For now, let's keep it simple: Calculate Only when running simulation if 0, 
    // OR we could add a helper button. The requirements said "System must calculate... if inertia = 0".
    // We handle that in runSimulation usually, but updating the Input UI is nice.

    // Track if user edits the name manually
    inputs.simName.addEventListener('input', () => {
        userEditedName = true;
    });
}

let userEditedName = false;


function runSimulation() {
    // 1. Gather Inputs
    // Helper to get float
    const getVal = (key) => parseFloat(inputs[key].value);

    const params = {
        kv: getVal('kv'),
        voltage: getVal('voltage'),
        resistance: getVal('resistance'),
        escLimit: getVal('escLimit'),
        reduction: getVal('reduction'),
        efficiency: getVal('efficiency') / 100, // % to 0-1
        rLong: getVal('rLong') / 1000,          // mm to m
        rShort: getVal('rShort') / 1000,        // mm to m
        height: getVal('height') / 1000,        // mm to m
        cd: getVal('cd'),
        viscousFriction: getVal('viscous'),
        inertia: getVal('inertia')
    };

    // Inertia Estimation Logic (UI Update)
    if (params.inertia === 0) {
        const massKg = getVal('mass') / 1000;
        const rLong = params.rLong;
        const rShort = params.rShort;

        // Distribute mass proportional to length (Simplified)
        const totalLen = rLong + rShort;
        const mLong = massKg * (rLong / totalLen);
        const mShort = massKg * (rShort / totalLen);

        // I = 1/3 * m * L^2
        const estimatedInertia = (1 / 3 * mLong * Math.pow(rLong, 2)) + (1 / 3 * mShort * Math.pow(rShort, 2));

        params.inertia = estimatedInertia; // Update for sim
        inputs.inertia.value = estimatedInertia.toExponential(4); // Update UI
    }

    // --- AUTO NAMING LOGIC ---
    let name = inputs.simName.value;

    // Only apply smart naming if the user hasn't manually edited the name field
    if (!userEditedName && lastParams) {
        const diffs = getParamDiffs(lastParams, params);
        if (diffs.length > 0) {
            name = diffs.join(', ');
            // Update the UI input so the user sees it
            inputs.simName.value = name;
        }
    }

    // Store deep copy for next compare
    lastParams = JSON.parse(JSON.stringify(params));
    // -------------------------

    // 2. Run Physics
    const results = simulateSpinup(params);

    // 3. Update KPIs
    updateKPIs(results.stats);

    // 4. Update Charts
    const color = COLORS[colorIdx % COLORS.length];
    colorIdx++;

    addData(rpmChart, name, results.timeData, results.rpmData, color);
    addData(currentChart, name, results.timeData, results.currentData, color);
}

// Global state for diffing
let lastParams = null;

function getParamDiffs(oldP, newP) {
    const diffs = [];
    const keys = {
        kv: 'KV',
        voltage: 'V',
        resistance: 'R',
        escLimit: 'I_esc',
        reduction: 'Red',
        efficiency: 'Eff',
        rLong: 'R_L',
        rShort: 'R_S',
        height: 'H',
        cd: 'Cd',
        viscousFriction: 'B',
        mass: 'Mass'
        // inertia is often calculated, might be noisy if small float diffs.
    };

    // Helper: is different?
    const isDiff = (a, b) => Math.abs(a - b) > 0.0001; // epsilon

    for (const [k, label] of Object.entries(keys)) {
        if (isDiff(oldP[k], newP[k])) {
            // Found a diff
            // Format: "KV: 900" or "KV 880->900"
            // User asked "smart-names... with what changed".
            // "KV 900" is cleaner if we assume user knows the old one, but "880->900" is explicit.
            // Let's go concise first: "KV: 900"
            if (k === 'voltage') {
                // Special case standard voltages? Nah just value.
                diffs.push(`${label}: ${newP[k]}`);
            } else {
                diffs.push(`${label}: ${newP[k]}`);
            }
        }
    }
    return diffs;
}

function updateKPIs(stats) {
    document.getElementById(outputIds.rpm).innerText = stats.rpm;
    document.getElementById(outputIds.time).innerText = stats.time + 's';
    document.getElementById(outputIds.tipSpeed).innerText = stats.tipSpeed;
    document.getElementById(outputIds.current).innerText = stats.current;
}

function addData(chart, label, timeData, valueData, color) {
    chart.data.datasets.push({
        label: label,
        data: timeData.map((t, i) => ({ x: t, y: valueData[i] })),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    });
    chart.update();
}

function clearCharts() {
    rpmChart.data.datasets = [];
    rpmChart.update();
    currentChart.data.datasets = [];
    currentChart.update();
    colorIdx = 0;

    // Reset KPIs
    updateKPIs({
        rpm: 0,
        time: 0,
        tipSpeed: 0,
        current: 0
    });
}
