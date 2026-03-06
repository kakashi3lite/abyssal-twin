# IoRT-DT Sustainability Plan
## Addressing the "Abandoned PhD Repo" Problem

This document commits IoRT-DT to long-term sustainability through architectural
and community decisions made from Day 1. It directly addresses Counsel 3 (Open-Source
Advocate) critique from the IoRT-DT Position Paper.

---

## Why PhD Repos Die (And How We Prevent It)

**Statistics:** ~80% of PhD repositories are abandoned within 2 years of graduation.
Common failure modes:
1. Monolithic, tightly-coupled code that only the author understands
2. No documentation beyond the paper
3. Single dependency (e.g., custom simulator fork) that breaks with upstream changes
4. No community of users beyond the author's lab

**IoRT-DT mitigation strategies:**

---

## 1. Modular Architecture (Not Monolithic)

Each RQ is a **standalone ROS 2 package** that can be used independently:

```
iort_dt_compression    → Works with ANY ROS 2 robot, not just underwater AUVs
iort_dt_anomaly        → Works with ANY DT residual stream
iort_dt_federation     → Works with ANY Zenoh-connected system
iort_dt_security       → Applicable to any ROS 2 + acoustic deployment
```

**Consequence:** If someone only wants the CUSUM anomaly detector, they can
`ros-jazzy-iort-dt-anomaly` and get it without installing Stonefish.

---

## 2. Upstream Contributions (Not Forks)

IoRT-DT does not fork Stonefish, rmw_zenoh, or ROS 2. Instead, it:

- Submits upstream PRs to Stonefish for acoustic modem simulation improvements
- Contributes anomaly detection hooks as Stonefish "plugin" interfaces
- Files ROS 2 REPs (Enhancement Proposals) for underwater robotics conventions

**Bus-factor mitigation:** If Stonefish development ceases, IoRT-DT's simulation
layer can switch to DAVE or HoloOcean — the interface layer is abstracted.

---

## 3. Graduated Support Commitment

| Period | Support Level |
|--------|--------------|
| PhD (2027-2030) | Full maintainer: bugs, features, community |
| Post-PhD (2030-2033) | Security patches + critical bugs only |
| 2033+ | Community handoff or archive with clear notice |

**Long-term handoff target:** Submit iort_dt_anomaly and iort_dt_federation
to the ROS 2 TSC for inclusion in the official ROS 2 ecosystem.

---

## 4. Community Onboarding

To avoid becoming "documentation-less," IoRT-DT commits to:

- [ ] "15-minute quickstart" tutorial (Docker → fault → alert)
- [ ] Video walkthrough on YouTube (linked from README)
- [ ] Annual release aligned with ROS 2 EOL schedule
- [ ] Responsive to issues within 2 weeks (during PhD)
- [ ] GitHub Discussions enabled for community Q&A

---

## 5. Funding Sustainability

IoRT-DT is not dependent on a single funding source:

- Academic: NSRI white paper (Year 1) → potential UARC contract
- NSF: MATH-DT proposal (Year 1, with faculty PI)
- Community: NumFOCUS small grant application (Year 2)
- Industry: Commercial support from defense system integrators (Year 3+)

---

## 6. Single-Maintainer Risk Mitigation (Stonefish)

Stonefish is maintained by Patryk Cieślak (Heriot-Watt).
IoRT-DT mitigates bus-factor risk by:

1. **Simulation abstraction layer:** `iort_dt_bringup/simulators.py` abstracts
   Stonefish behind a common interface. Swap to DAVE with one config change.
2. **Upstream collaboration:** IoRT-DT's ICRA 2025 Stonefish paper relationship
   creates a collaborative rather than dependent relationship.
3. **Hardware layer:** Year 3 hardware-in-the-loop work reduces simulation dependency.

---

## Metric: "Would I Use This in 2035?"

The sustainability test: would a marine robotics lab in 2035 be able to
use IoRT-DT with no assistance from the original author?

**Requirements:**
- [ ] Docker image builds without modification
- [ ] Tutorial runs to completion
- [ ] All RQ tests pass
- [ ] Clear upgrade path to newer ROS 2 versions

**Tracking:** Annual "sustainability audit" before each October release.
