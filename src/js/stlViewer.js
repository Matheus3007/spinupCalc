import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

let scene, camera, renderer, container;
let mesh, edges; // The 3D object components
let axisLine;   // The rotation axis line
let animationId;

export function init3DViewer(domElementId) {
    container = document.getElementById(domElementId);
    if (!container) return;

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505); // Match app bg
    // Add some subtle grid/fog if needed later, but keeping it stark for now.

    // 2. Camera
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    camera.position.set(200, 200, 200); // Default Zoom
    camera.lookAt(0, 0, 0);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.innerHTML = ''; // Clear placeholder
    container.appendChild(renderer.domElement);

    // 4. Lights (Basic)
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(10, 10, 10);
    scene.add(dirLight);

    // 5. Grid Helper (Optional, for scale)
    const gridHelper = new THREE.GridHelper(500, 50, 0x222222, 0x111111);
    scene.add(gridHelper);

    // Setup File Listener (Old input change listener)
    const fileInput = document.getElementById('stlFile');
    fileInput.addEventListener('change', handleFileUpload);

    // Setup Drag & Drop
    const dropZone = document.getElementById('drop-zone');

    // Click to browse
    dropZone.addEventListener('click', () => fileInput.click());

    // Drag Events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Highlight
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    // Handle Drop
    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    }

    // Orientation Toggle
    const orientationToggle = document.getElementById('orientationToggle');
    orientationToggle.addEventListener('change', () => {
        // Re-align using last known normal if it exists
        if (lastSelectedNormal && mesh) {
            alignGeometryToUp(mesh, lastSelectedNormal);
        }
    });

    // Interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    renderer.domElement.addEventListener('click', (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(mesh);

        if (intersects.length > 0) {
            const face = intersects[0].face;
            lastSelectedNormal = face.normal.clone(); // Store for toggle switching

            // Align Geometry so Selected Face Normal points UP (Y+) or OUT (Z+)
            alignGeometryToUp(mesh, lastSelectedNormal);
        }
    });

    // ... (rest of Apply Button Logic) ...
    // Apply Button Logic
    const applyBtn = document.getElementById('btn-apply-stl');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            const stlMass = document.getElementById('stlMass').value;
            const stlInertia = document.getElementById('stlInertia').value;

            if (stlMass !== '-') document.getElementById('mass').value = stlMass;
            if (stlInertia !== '-') document.getElementById('inertia').value = stlInertia;

            // Visual feedback
            applyBtn.innerText = "Values Applied!";
            setTimeout(() => applyBtn.innerText = "Apply to Physics Inputs", 2000);
        });
    }

    // Handle Resize
    window.addEventListener('resize', onWindowResize);

    // Start Loop
    animate();
}

function handleFileUpload(event) {
    handleFile(event.target.files[0]);
}

// Shared File Handler
function handleFile(file) {
    // ... (existing handleFile code) ...
    if (!file) return;

    // Update UI text
    const dropText = document.querySelector('.drop-text');
    if (dropText) dropText.innerText = "LOADING: " + file.name.toUpperCase();

    const reader = new FileReader();
    reader.onload = function (e) {
        const contents = e.target.result;
        loadSTLCallback(contents);
        if (dropText) dropText.innerText = "LOADED: " + file.name.toUpperCase();
    };
    reader.readAsArrayBuffer(file);
}

// Globals for Logic
let lastSelectedNormal = null;
let currentSpinAxis = new THREE.Vector3(0, 1, 0); // Default Horizontal (Y)
let originalGeometry = null;

function alignGeometryToUp(mesh, normal) {
    if (!originalGeometry) return;

    const isVertical = document.getElementById('orientationToggle').checked;

    // Target Axis: Y (0,1,0) for Horizontal, Z (0,0,1) for Vertical
    const targetAxis = isVertical ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    currentSpinAxis.copy(targetAxis); // Update global spin axis

    // 1. Reset to Original Geometry
    mesh.geometry.dispose();
    mesh.geometry = originalGeometry.clone();

    // 2. Calculate Quaternion from Selected Normal to Target Axis
    const quaternion = new THREE.Quaternion().setFromUnitVectors(normal, targetAxis);

    // 3. Apply to Geometry
    mesh.geometry.applyQuaternion(quaternion);

    // 4. Re-Center (Just in case rotation shifted bounds)
    mesh.geometry.center();

    // 5. Update Helper Edges
    const oldEdges = mesh.children.find(c => c.isLineSegments);
    if (oldEdges) {
        mesh.remove(oldEdges);
        oldEdges.geometry.dispose();
        oldEdges.material.dispose();
    }
    const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, 10);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x00FF00 });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    mesh.add(edges);

    // 6. Reset Mesh Rotation (Visual)
    mesh.rotation.set(0, 0, 0);

    // Recalculate Physics around Target Axis
    calculatePhysics(mesh.geometry, targetAxis);

    // 7. Re-Fit Camera
    fitCameraToMesh(mesh);

    // 8. Update Axis Visual
    updateAxisLine(targetAxis);
}
// ... (rest of file) ...

function loadSTLCallback(data) {
    const loader = new STLLoader();
    const geometry = loader.parse(data);

    // Center Geometry
    geometry.center();

    // Store Original for Resetting
    if (originalGeometry) originalGeometry.dispose();
    originalGeometry = geometry.clone();

    // Remove old mesh
    if (mesh) {
        scene.remove(mesh);
        // edges is child of mesh, handles itself
        mesh.geometry.dispose();
        mesh.material.dispose();
    }

    // 1. Black Occlusion Mesh (Blocks bg lines)
    const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // 2. Stark Green Wireframe (Edges)
    const edgesGeo = new THREE.EdgesGeometry(geometry, 10);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x00FF00 });
    edges = new THREE.LineSegments(edgesGeo, edgesMat);
    mesh.add(edges);

    // Auto-Zoom to fit
    fitCameraToMesh(mesh);

    // Initial Physics Calc (Default Axis Y - assumes flat import)
    calculatePhysics(geometry, currentSpinAxis);

    // Initial Axis Visual
    updateAxisLine(currentSpinAxis);
}

function calculatePhysics(geometry, axis) {
    // 1. Get Density
    const densityInput = document.getElementById('materialDensity');
    const densityVal = parseFloat(densityInput.value) || 7.85; // g/cm^3
    const densityGmm3 = densityVal / 1000;

    // 2. Calculate Volume (Signed Triangle Volume - Input assumed mm)
    const volume = getVolume(geometry); // mm^3
    const massG = volume * densityGmm3;

    // 3. Update STL UI Mass (Read-only)
    const stlMassInput = document.getElementById('stlMass');
    if (stlMassInput) stlMassInput.value = massG.toFixed(1);

    // 4. Calculate Inertia Tensor
    // Geometry is ALREADY transformed to align with 'axis' (which is Y)
    // So we just calc Iyy

    const I_axis = calculateInertiaAroundAxis(geometry, axis, densityGmm3); // g*mm^2

    // Convert to kg*m^2 for the Physics Engine
    // 1 g*mm^2 = 1e-9 kg*m^2
    const I_kgm2 = I_axis * 1e-9;

    // Update STL UI Inertia (Read-only)
    const stlInertiaInput = document.getElementById('stlInertia');
    if (stlInertiaInput) stlInertiaInput.value = I_kgm2.toExponential(4);

    // --- AUTO APPLY TO MAIN INPUTS ---
    // Previously we demanded a click. Now we just do it.
    const mainMassInput = document.getElementById('mass');
    const mainInertiaInput = document.getElementById('inertia');
    const applyBtn = document.getElementById('btn-apply-stl');

    if (mainMassInput && stlMassInput.value !== '-') {
        mainMassInput.value = stlMassInput.value;
    }
    if (mainInertiaInput && stlInertiaInput.value !== '-') {
        mainInertiaInput.value = stlInertiaInput.value;
    }

    // Update Button Text temporarily to show it happened (User feedback)
    if (applyBtn) {
        applyBtn.innerText = "Auto-Applied!";
        setTimeout(() => applyBtn.innerText = "Apply to Physics Inputs", 2000);
    }
}

function getVolume(geometry) {
    let vol = 0;
    const pos = geometry.attributes.position;
    const p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();

    for (let i = 0; i < pos.count; i += 3) {
        p1.fromBufferAttribute(pos, i);
        p2.fromBufferAttribute(pos, i + 1);
        p3.fromBufferAttribute(pos, i + 2);
        vol += p1.dot(p2.cross(p3)) / 6.0;
    }
    return Math.abs(vol);
}

function calculateInertiaAroundAxis(geometry, axis, density) {
    let I_total = 0;
    const pos = geometry.attributes.position;
    const p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();
    const centroid = new THREE.Vector3();

    for (let i = 0; i < pos.count; i += 3) {
        p1.fromBufferAttribute(pos, i);
        p2.fromBufferAttribute(pos, i + 1);
        p3.fromBufferAttribute(pos, i + 2);

        const vTet = Math.abs(p1.dot(p2.cross(p3)) / 6.0); // Volume of tetrahedron
        const mTet = vTet * density;

        // Centroid
        centroid.copy(p1).add(p2).add(p3).multiplyScalar(0.25);

        // Distance squared from axis (axis is unit vector)
        // d^2 = |r|^2 - (r . axis)^2
        const dSq = centroid.lengthSq() - Math.pow(centroid.dot(axis), 2);

        I_total += mTet * dSq;
    }

    return I_total;
}

function fitCameraToMesh(mesh) {
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Get max dimension
    const maxDim = Math.max(size.x, size.y, size.z);

    // Calculate distance to fit
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

    // Adjust for aspect ratio if wide/tall
    // If aspect < 1 (portrait), we need to be further back to fit horizontal width
    if (camera.aspect < 1) {
        cameraZ = cameraZ / camera.aspect;
    }

    // Add a larger margin (multiplying by 1.3 = 30% margin)
    cameraZ *= 1.3;

    // Position camera
    // We keep the "isometric-ish" angle but adjust distance
    const direction = new THREE.Vector3(1, 1, 1).normalize();
    const position = center.clone().add(direction.multiplyScalar(cameraZ));

    camera.position.copy(position);
    camera.lookAt(center);

    // Update clipping planes
    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();

    // Update OrbitControls target if we had them (we don't yet, but good practice)
}

function updateAxisLine(axis) {
    const length = 1000;
    const points = [
        axis.clone().multiplyScalar(-length / 2),
        axis.clone().multiplyScalar(length / 2)
    ];

    if (!axisLine) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xFFFF00, transparent: true, opacity: 0.6 });
        axisLine = new THREE.Line(geometry, material);
        scene.add(axisLine);
    } else {
        axisLine.geometry.setFromPoints(points);
        axisLine.geometry.verticesNeedUpdate = true;
    }
}

function onWindowResize() {
    if (!container || !camera || !renderer) return;
    const aspect = container.clientWidth / container.clientHeight;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    animationId = requestAnimationFrame(animate);

    if (mesh) {
        // Spin based on current axis mode
        // Horizontal (Y default): mesh.rotation.y
        // Vertical (Z): mesh.rotation.z

        // Note: Since we ALIGNED the geometry to the axis, 
        // the rotation is local to the mesh's new coordinate system?
        // No, three.js rotation is Applied in Euler order?
        // Actually, if we transformed geometry, the mesh's local axes 
        // aligned with World axes.
        // So if we aligned to Y, we spin Y.
        // If we aligned to Z, we spin Z.

        const isVertical = document.getElementById('orientationToggle').checked;
        if (isVertical) {
            mesh.rotation.z += 0.02;
            mesh.rotation.y = 0; // Ensure no drift
        } else {
            mesh.rotation.y += 0.02;
            mesh.rotation.z = 0;
        }
    }

    renderer.render(scene, camera);
}
