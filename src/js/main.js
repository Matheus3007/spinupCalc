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

    // Weapon Geo
    weaponType: document.getElementById('weaponType'),
    rLong: document.getElementById('rLong'),
    rShort: document.getElementById('rShort'),
    rStart: document.getElementById('rStart'),       // NEW
    nTeeth: document.getElementById('nTeeth'),       // NEW
    wallThickness: document.getElementById('wallThickness'), // NEW
    height: document.getElementById('height'),
    cd: document.getElementById('dragCoeff'),

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

const BATCH_HEADERS = [
    'Name', 'KV', 'Voltage', 'Resistance', 'ESC_Limit', 'Reduction', 'Efficiency',
    'Type', 'R_Long', 'R_Start', 'R_Short', 'N_Teeth', 'Wall_Thick', 'Height', 'Drag_Coeff',
    'Inertia', 'Mass', 'Viscous_Friction'
];

const BATCH_KEYS = [
    'simName', 'kv', 'voltage', 'resistance', 'escLimit', 'reduction', 'efficiency',
    'weaponType', 'rLong', 'rStart', 'rShort', 'nTeeth', 'wallThickness', 'height', 'cd',
    'inertia', 'mass', 'viscous'
];

let batchResults = [];

function setupEventListeners() {
    document.getElementById('btn-add').addEventListener('click', runSimulation);
    document.getElementById('btn-clear').addEventListener('click', clearCharts);

    // Batch Tools
    document.getElementById('btn-template').addEventListener('click', downloadTemplate);
    const csvInput = document.getElementById('csvFile');
    document.getElementById('btn-upload-csv').addEventListener('click', () => csvInput.click());
    csvInput.addEventListener('change', handleBatchUpload);
    document.getElementById('btn-export').addEventListener('click', exportBatchResults);

    // Weapon Type Toggle
    inputs.weaponType.addEventListener('change', handleWeaponTypeChange);
    handleWeaponTypeChange(); // Init state

    // Track if user edits the name manually
    inputs.simName.addEventListener('input', () => {
        userEditedName = true;
    });
}

function handleWeaponTypeChange() {
    const type = inputs.weaponType.value;
    const rShortRow = document.getElementById('row-rShort');
    const rStartRow = document.getElementById('row-rStart');
    const nTeethRow = document.getElementById('row-nTeeth');
    const wallRow = document.getElementById('row-wallThick');

    // Reset defaults first
    rShortRow.style.display = 'none';
    rStartRow.style.display = 'none';
    nTeethRow.style.display = 'none';
    wallRow.style.display = 'none';

    if (type === 'barAsym') {
        rShortRow.style.display = 'flex';
    } else if (type === 'barSym') {
        nTeethRow.style.display = 'flex';
    } else if (type === 'drum') {
        rStartRow.style.display = 'flex';
        nTeethRow.style.display = 'flex';
        // Drum implies shell + hubs. Do we need teeth? Usually not for simple drum drag calc.
    } else if (type === 'eggbeater') {
        rStartRow.style.display = 'flex';
        nTeethRow.style.display = 'flex';
        wallRow.style.display = 'flex';
    }
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

        // Geometry
        weaponType: inputs.weaponType.value,
        rLong: getVal('rLong') / 1000,          // mm to m
        rShort: getVal('rShort') / 1000,        // mm to m
        rStart: getVal('rStart') / 1000,        // mm to m
        nTeeth: getVal('nTeeth'),
        wallThickness: getVal('wallThickness') / 1000, // mm to m
        height: getVal('height') / 1000,        // mm to m
        cd: getVal('cd'),

        viscousFriction: getVal('viscous'),
        inertia: getVal('inertia')
    };

    // Inertia Estimation Logic (UI Update)
    if (params.inertia === 0) {
        let estimatedInertia = 0;
        const massKg = getVal('mass') / 1000;

        if (params.weaponType === 'barAsym' || params.weaponType === 'barSym') {
            const rLong = params.rLong;
            const rShort = params.rShort; // For Asym
            // Simple rod approx
            const totalLen = rLong + rShort;
            const mLong = massKg * (rLong / totalLen);
            const mShort = massKg * (rShort / totalLen);
            estimatedInertia = (1 / 3 * mLong * Math.pow(rLong, 2)) + (1 / 3 * mShort * Math.pow(rShort, 2));
        } else if (params.weaponType === 'drum' || params.weaponType === 'eggbeater') {
            // Hollow Cylinder approx I = 1/2 * m * (r1^2 + r2^2)
            // r1 = rStart, r2 = rLong
            const r1 = params.rStart;
            const r2 = params.rLong;
            estimatedInertia = 0.5 * massKg * (Math.pow(r1, 2) + Math.pow(r2, 2));
        }

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



function downloadTemplate() {
    const csvContent = BATCH_HEADERS.join(',') + '\n' +
        'Example Motor,900,16.8,0.05,50,1,90,barAsym,150,0,50,2,0,10,1.2,0,400,0'; // Example row

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spinup_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

function handleBatchUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        processBatchCSV(text);
        // Reset input so same file can be selected again
        event.target.value = '';
    };
    reader.readAsText(file);
}

function processBatchCSV(csvText) {
    const lines = csvText.split(/\r\n|\n/);
    // Remove header
    const dataLines = lines.slice(1).filter(l => l.trim().length > 0);

    // Clear existing batch results if we treat this as a fresh session?
    // User said "instantly plot", implies adding to current view or replacing. 
    // Usually batch implies "here is my set". Let's clear previous batch context but keep existing manual runs?
    // User said "test various motors... plot them instantly".
    // Let's NOT clear automatically, but ensure we add to batchResults array.

    // Actually, good UX: reset batchResults array for THIS upload, but append to chart.
    batchResults = [];
    document.getElementById('btn-export').disabled = false;

    dataLines.forEach(line => {
        const cols = line.split(',');
        if (cols.length < BATCH_KEYS.length) return; // Skip malformed

        // Construct params object
        const rawValues = {};
        BATCH_KEYS.forEach((key, idx) => {
            rawValues[key] = cols[idx].trim();
        });

        // 1. Map to Simulation Params (Parsing Strings to Floats)
        const params = {
            kv: parseFloat(rawValues.kv),
            voltage: parseFloat(rawValues.voltage),
            resistance: parseFloat(rawValues.resistance),
            escLimit: parseFloat(rawValues.escLimit),
            reduction: parseFloat(rawValues.reduction),
            efficiency: parseFloat(rawValues.efficiency) / 100,

            weaponType: rawValues.weaponType || 'barAsym',
            rLong: parseFloat(rawValues.rLong) / 1000,
            rStart: (parseFloat(rawValues.rStart) || 0) / 1000,
            rShort: (parseFloat(rawValues.rShort) || 0) / 1000,
            nTeeth: parseFloat(rawValues.nTeeth) || 2,
            wallThickness: (parseFloat(rawValues.wallThickness) || 0) / 1000,
            height: parseFloat(rawValues.height) / 1000,
            cd: parseFloat(rawValues.cd),

            viscousFriction: parseFloat(rawValues.viscous) || 0,
            inertia: parseFloat(rawValues.inertia) || 0
        };

        const massVal = parseFloat(rawValues.mass); // For estimation if needed

        // Inertia Auto-Est Logic (Same as runSimulation)
        if (params.inertia === 0 && massVal > 0) {
            let estimatedInertia = 0;
            const massKg = massVal / 1000;

            // Basic Fallback Logic for CSV if type matches
            if (params.weaponType.includes('bar')) {
                const rLong = params.rLong;
                const rShort = params.rShort;
                const totalLen = rLong + rShort;
                const mLong = massKg * (rLong / totalLen);
                const mShort = massKg * (rShort / totalLen);
                estimatedInertia = (1 / 3 * mLong * Math.pow(rLong, 2)) + (1 / 3 * mShort * Math.pow(rShort, 2));
            } else if (params.weaponType === 'drum' || params.weaponType === 'eggbeater') {
                const r1 = params.rStart || 0;
                const r2 = params.rLong;
                estimatedInertia = 0.5 * massKg * (Math.pow(r1, 2) + Math.pow(r2, 2));
            }
            params.inertia = estimatedInertia;
        }

        // 2. Run Sim
        const results = simulateSpinup(params);

        // 3. Add to Charts
        const color = COLORS[colorIdx % COLORS.length];
        colorIdx++;
        addData(rpmChart, rawValues.simName, results.timeData, results.rpmData, color);
        addData(currentChart, rawValues.simName, results.timeData, results.currentData, color);

        // 4. Store Result for Export (Merge Raw Inputs + KPI Outputs)
        batchResults.push({
            ...rawValues,
            // Add KPIs
            res_max_rpm: results.stats.rpm,
            res_time: results.stats.time,
            res_tip_speed: results.stats.tipSpeed,
            res_current: results.stats.current
        });
    });

    // Update KPI display to the last one? Or leave as is?
    // Probably leave manual KPIs alone or show the last one processed.
}

function exportBatchResults() {
    if (batchResults.length === 0) return;

    // Headers: Inputs + Outputs
    const exportHeaders = [...BATCH_HEADERS, 'Max_RPM', 'Spinup_Time', 'Tip_Speed', 'Hover_Current'];
    const headerRow = exportHeaders.join(',');

    const rows = batchResults.map(res => {
        return exportHeaders.map(header => {
            // Map header Name back to key? 
            // We need a map.
            // Simplified: We constructed batchResults with keys matching BATCH_KEYS + res_...
            // Let's verify mapping.

            // Map BATCH_HEADERS index to key
            const inputIdx = BATCH_HEADERS.indexOf(header);
            if (inputIdx !== -1) {
                return res[BATCH_KEYS[inputIdx]];
            }
            // Outputs
            switch (header) {
                case 'Max_RPM': return res.res_max_rpm;
                case 'Spinup_Time': return res.res_time;
                case 'Tip_Speed': return res.res_tip_speed;
                case 'Hover_Current': return res.res_current;
                default: return '';
            }
        }).join(',');
    });

    const csvContent = headerRow + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spinup_results.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

function clearCharts() {
    rpmChart.data.datasets = [];
    rpmChart.update();
    currentChart.data.datasets = [];
    currentChart.update();
    colorIdx = 0;
    batchResults = [];
    document.getElementById('btn-export').disabled = true;

    // Reset KPIs
    updateKPIs({
        rpm: 0,
        time: 0,
        tipSpeed: 0,
        current: 0
    });
}
