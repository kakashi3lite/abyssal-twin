# IoRT-DT: Simulation Limitations & Hardware Transition Plan

This document transparently documents what IoRT-DT can and cannot claim
based on simulation-only validation (Years 1–2 of the PhD program).

This directly addresses Counsel 4 (The Field Engineer) critique.

---

## Current Validation Status (March 2027 — Phase 1)

| Component | Validation Level | Notes |
|-----------|-----------------|-------|
| RQ1: Compression codec | ✅ Property-based (Hypothesis) | Pure algorithm, no hardware needed |
| RQ1: Sync rate bounds | ✅ Stonefish simulation | Bellhop acoustic model |
| RQ2: Gossip protocol | ✅ Docker multi-container | Network emulation via tc/tc-netem |
| RQ3: CUSUM bounds | ✅ Mathematical proof | Siegmund (1985) + empirical validation |
| RQ3: Detection delay | ✅ Stonefish simulation | Injected faults in simulator |
| RQ4: DDS handshake | ✅ Stonefish simulation | 9600 baud via tc-netem |
| RQ4: Replay attacks | ✅ Red-team scripts | Simulated acoustic channel |
| **Hardware deployment** | ❌ Not yet | Year 3 target |

---

## What Simulation-Only Validation Cannot Prove

1. **Real acoustic multipath:** Stonefish uses Bellhop for propagation modeling,
   but actual ocean environments have thermoclines, salinity gradients, and
   ship noise that are not fully modeled. Real packet loss may differ.

2. **BlueROV2/AUV timing:** The latency between ROS 2 node scheduling and
   physical actuator response on embedded hardware (Jetson Orin) may differ
   from simulation.

3. **Real current disturbances:** Simulated ocean currents (Stonefish JSON config)
   are approximations. Real AUV hydrodynamic response under strong currents
   may affect residual distributions (critical for CUSUM calibration).

4. **Thruster degradation profiles:** The 20% efficiency loss model used for
   RQ3 validation is based on BlueROV2 documentation. Actual degradation
   profiles (fouling, cavitation) are more complex.

---

## Hardware-Ready Design Decisions

Despite simulation-only validation in Years 1–2, IoRT-DT is **architecturally
hardware-ready** through the following design choices:

### 1. Hardware Abstraction Layer (HAL)

```python
# iort_dt_bringup/simulators.py
class SimulatorInterface(ABC):
    @abstractmethod
    def get_state(self, auv_id: int) -> AUVStateVector: ...
    @abstractmethod
    def inject_fault(self, fault: FaultDefinition) -> None: ...

class StonefishSimulator(SimulatorInterface): ...  # Year 1-2
class BlueROV2Hardware(SimulatorInterface): ...    # Year 3 (HIL)
class SparsusAUVHardware(SimulatorInterface): ...  # Year 3+ (field)
```

Single line to switch from simulation to hardware: change `simulator_type` in
`configs/scenarios/default.yaml`.

### 2. Acoustic Modem Interface Abstraction

```python
class AcousticChannel(ABC):
    @abstractmethod
    def transmit(self, packet: bytes) -> tuple[bool, float]: ...

class SimulatedAcousticChannel(AcousticChannel): ...  # Zenoh + tc-netem
class EvoLogicsS2CR(AcousticChannel): ...             # Real ~$15K modem
```

### 3. ROS 2 Topic Compatibility

All IoRT-DT nodes use standard ROS 2 message types where possible:
- `sensor_msgs/Imu` for IMU data
- `nav_msgs/Odometry` for vehicle state
- Custom `iort_dt_msgs` only where standard types are insufficient

This ensures compatibility with real AUV platforms (BlueROV2/ArduSub,
LAUV, Sparus II) without modification.

---

## Year 3 Hardware Validation Plan

**Target partnerships:**
1. **Heriot-Watt University (AURA team):** Physical BlueROV2 tank testing
   (pool or North Sea trials). Dr. Yvan Petillot's group has AURA hardware.
2. **Florida International University:** Acoustic test tank in AMERI facility.
3. **JAMSTEC (via SIP3):** Real AUV deployment (aspirational, Year 3+).

**Minimum hardware for credible validation:**
- 1× BlueROV2 (~$3,500) — for tethered ROV tests
- 2× EvoLogics S2C R modems (~$30K pair) — for acoustic channel emulation
- 1× NVIDIA Jetson Orin (~$500) — embedded compute representative

**Hardware-in-the-loop (HIL) plan:**
```
Stonefish DT (support vessel PC) ←──acoustic modem──→ BlueROV2 (physical)
           ↑                                                    ↑
     CUSUM detector                                       ArduSub/ROS 2
     Federation node                                      actual sensors
```

---

## Claims This Work Can Legitimately Make

✅ **With simulation validation only:**
- "We characterize the minimum sync rate that preserves anomaly detection F1>0.9
  in a high-fidelity physics simulation under realistic acoustic channel models"
- "Our CUSUM detector has ARL₀>10,000 steps (proven theoretically and verified
  empirically in simulation)"
- "Our gossip federation protocol reduces bandwidth by >50% vs broadcast
  with <60s convergence after network partition (in emulated acoustic network)"

⚠️ **Requires hardware validation before claiming:**
- "The system works in open ocean"
- "Detection delays are achievable on embedded AUV hardware"
- "The system is deployable on JAMSTEC/SIP3 platforms"

---

*This limitation document is included in every paper submission and in
the dissertation introduction. Transparency about simulation-only validation
is not a weakness — it is scientific integrity.*
