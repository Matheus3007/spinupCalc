# SpinupCalc

A physics calculator for **Beetleweight combat robots**, designed to simulate weapon spin-up times, current draw, and aerodynamic drag.

## Features
- **Physics Simulation**: Calculates spin-up time, max RPM, and current limits accounting for aerodynamic drag (Cd) and viscous friction.
- **Smart Charts**: Real-time plotting of RPM and Current vs. Time (Chart.js).
- **Auto-Naming**: Smartly names scenarios based on changed parameters.
- **Inertia Estimation**: Automatically estimates inertia if unknown based on mass and geometry.

## Quick Start
1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run Locally**
   ```bash
   npm run dev
   ```

## Tech Stack
- **Vite** (Build Tool)
- **Vanilla JavaScript** (Logic)
- **Chart.js** (Visualization)
- **CSS3** (High-tech Brutalist Theme)

## Physics Calculation

The simulation uses an **Euler integration loop** with a 10ms time step to model the weapon's angular acceleration ($\alpha$) based on the net torque ($\tau_{net}$) applied to the system.

### 1. Motor Torque
The motor torque is the lesser of two limits (ESCs regulate current, but physics regulates Back-EMF):
- **Voltage Limit** (Back-EMF): $\tau_{volt} = K_t \frac{V}{R} (1 - \frac{\omega}{\omega_{no\_load}})$
- **Current Limit** (ESC): $\tau_{esc} = K_t \cdot I_{esc\_max}$

$$ \tau_{motor} = \min(\tau_{volt}, \tau_{esc}) $$

### 2. Resistive Forces
- **Aerodynamic Drag**: Modeled as a quadratic force.
  $$ \tau_{drag} = K_s \cdot \omega^2 $$
  Where $K_s = \frac{1}{8} \rho C_d h (R_{long}^4 + R_{short}^4)$
- **Viscous Friction**: Modeled as a linear drag component (bearing/belt losses).
  $$ \tau_{viscous} = B \cdot \omega $$

### 3. Net Acceleration
The final equation of motion solved per step:
$$ I \cdot \alpha = (\tau_{motor} \cdot Ratio \cdot \eta) - \tau_{drag} - \tau_{viscous} $$

Where:
- $I$: Moment of Inertia
- $\eta$: Transmission Efficiency
- $Ratio$: Reduction Ratio

## License
MIT
