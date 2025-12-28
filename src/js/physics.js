/**
 * Physics Engine for Spin-Up Simulation
 */

export function simulateSpinup(params) {
    const {
        kv, voltage, resistance, escLimit, // Motor / Elec
        reduction, efficiency,             // Transmission
        rLong, rShort, height, cd, nTeeth, //
        wallThickness, rStart,       // Weapon Geo
        inertia,                           // Physics
        viscousFriction = 0                // New parameter (B)
    } = params;

    // Derived Constants
    const kt = 9.55 / kv; // Torque Constant (Nm/A)
    const rho = 1.225;    // Air Density (kg/m^3)

    // Aerodynamic Constant (Ks)
    const ks = calculateKs(params.weaponType || 'barAsym', rho, cd, height, rLong, rStart || 0, rShort || 0, nTeeth || 2, wallThickness || 0);

    function calculateKs(type, rho, Cd, h, Rlong, Rstart, Rshort, N, wallThickness) {
        // Factor comum: 1/8 * rho * Cd * h
        const factor = (1 / 8) * rho * Cd * h;

        switch (type) {
            case 'barAsym':
                return factor * (Math.pow(Rlong, 4) + Math.pow(Rshort, 4));

            case 'barSym':
                return factor * N * Math.pow(Rlong, 4);

            case 'drum':
                return factor * N * (Math.pow(Rlong, 4) - Math.pow(Rstart, 4));

            case 'eggbeater':
                return factor * N * (Math.pow(Rlong, 4) - Math.pow(Rstart, 4));

            default:
                // Fallback to Bar Asym logic
                return factor * (Math.pow(Rlong, 4) + Math.pow(Rshort, 4));
        }
    }

    // Motor No-Load Speed (rad/s)
    const w_motor_no_load = kv * voltage * (2 * Math.PI / 60);

    // Stall Torques
    const stall_torque_elec = kt * (voltage / resistance); // Theoretical max
    const stall_torque_esc = kt * escLimit;                // ESC limited

    // Simulation Config
    const dt = 0.01;      // 10ms step
    const maxTime = 15;   // 15 seconds timeout

    let t = 0;
    let w_weapon = 0;     // Weapon Angular Velocity (rad/s)

    // Data Accumulators (for plotting)
    const timeData = [];
    const rpmData = [];
    const currentData = [];

    // Integration Loop (Euler)
    while (t < maxTime) {
        // 1. Motor Speed (rad/s)
        const w_motor = w_weapon * reduction;

        // 2. Motor Available Torque
        // a) Voltage Limit (Back-EMF line)
        const t_motor_volt = stall_torque_elec * (1 - w_motor / w_motor_no_load);
        // b) Current Limit (ESC line)
        const t_motor_curr = stall_torque_esc;

        // Motor delivers the lesser of the two (bounded 0)
        const t_motor_net = Math.max(0, Math.min(t_motor_volt, t_motor_curr));

        // 3. Applied Torque to Weapon
        const t_applied = t_motor_net * reduction * efficiency;

        // 4. Resistance Torques
        // a) Aerodynamic Drag (Quadratic)
        const t_drag = ks * (w_weapon * w_weapon);
        // b) Viscous Friction (Linear) - NEW
        const t_viscous = viscousFriction * w_weapon;

        // 5. Net Torque & Acceleration
        const t_net = t_applied - t_drag - t_viscous;

        // F = ma -> T = I * alpha
        const alpha = t_net / inertia;

        // 6. Update State
        w_weapon += alpha * dt;
        t += dt;

        // 7. Logging (downsample slightly for UI performance if needed, 
        // but 10ms is usually fine for Chart.js ~1500 points)
        // Let's log every 5th step (50ms resolution) to keep charts snappy
        if (t % 0.05 < dt) {
            timeData.push(parseFloat(t.toFixed(2)));
            rpmData.push(w_weapon * 9.5492966); // rad/s to RPM
            currentData.push(t_motor_net / kt); // Motor Current (A)
        }

        // 8. Exit Condition (Steady State)
        // If net torque is negligible and we've run for at least 0.5s
        if (t_net < 0.001 && t > 0.5) break;
    }

    // Final Statistics
    const finalRPM = w_weapon * 9.5492966;
    const finalTipSpeed = w_weapon * rLong; // m/s
    // Current required to maintain this speed (hover current)
    // At steady state: T_applied = T_drag + T_viscous
    // T_motor * red * eff = ks*w^2 + B*w
    // T_motor = (ks*w^2 + B*w) / (red * eff)
    // I_motor = T_motor / kt
    const steadyStateTorque = (ks * Math.pow(w_weapon, 2) + viscousFriction * w_weapon) / (reduction * efficiency);
    const steadyStateCurrent = steadyStateTorque / kt;

    return {
        timeData,
        rpmData,
        currentData,
        stats: {
            rpm: Math.round(finalRPM),
            time: timeData[timeData.length - 1],
            tipSpeed: finalTipSpeed.toFixed(1), // m/s
            current: steadyStateCurrent.toFixed(1)
        }
    }
}

function calculateKs(type, rho, Cd, h, Rlong, Rstart, Rshort, N, wallThickness) {
    // Common factor: 1/8 * rho * Cd * h * Kd (0.8 for 3D correction?)

    const factor = (1 / 8) * rho * Cd * h;

    switch (type) {
        case 'barAsym':
            return factor * (Math.pow(Rlong, 4) + Math.pow(Rshort, 4));

        case 'barSym':
            // "N = num of teeth"
            return factor * N * Math.pow(Rlong, 4);

        case 'drum':
        case 'eggbeater':
            return factor * N * (Math.pow(Rlong, 4) - Math.pow(Rstart, 4));

        default:
            return 0;
    }
}
