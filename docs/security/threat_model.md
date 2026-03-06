# STRIDE Threat Model: IoRT-DT Acoustic DDS Security
## RQ4 Documentation — Security Analysis for Underwater ROS 2 Deployments
### Tanavade, S. (2026) — PhD Research, University of Nebraska at Omaha

---

## System Boundary

The threat model covers the IoRT-DT communication stack:

```
[AUV Physical System] ──acoustic link──> [Support Vessel DT Engine]
        │                                         │
   [ROS 2 Node]  <──── DDS/SROS2 ────>  [ROS 2 Broker]
        │                                         │
   [Zenoh Bridge] ──9600 baud acoustic── [Zenoh Router]
        │                                         │
  [CUSUM Detector]                      [Grafana Dashboard]
```

**Acoustic channel properties:** 9600 baud, 2s latency, 30-70% packet loss, multipath

---

## STRIDE Analysis

### S — Spoofing (Participant Identity Spoofing)

**Deng et al. (2022) V2:** ROS 2 DDS allows participant discovery without authentication,
enabling an attacker to inject as a legitimate AUV.

**Acoustic-specific amplification:** Low bandwidth makes re-authentication expensive.
Once a spoofed participant is accepted, eviction requires bandwidth-costly handshake.

| Threat ID | Description | CVSS | Mitigation |
|-----------|-------------|------|-----------|
| S-1 | AUV identity spoofing via participant_id | 8.2 HIGH | SROS2 mutual TLS with ECDSA P-256 certs |
| S-2 | Support vessel impersonation | 7.5 HIGH | Certificate pinning per acoustic session |
| S-3 | Replay-based identity confusion | 6.8 MEDIUM | Sequence number nonces + timestamp freshness |

**RQ4 Mitigation: ECDSA P-256** certificates (121 bytes DER vs 1164 for RSA-2048).
89% size reduction critical for acoustic transmission.

---

### T — Tampering (Data Integrity Attacks)

**Acoustic-specific:** DT state vectors in transit are easily tampered
(acoustic channel lacks physical layer security unlike fiber).

| Threat ID | Description | CVSS | Mitigation |
|-----------|-------------|------|-----------|
| T-1 | State vector tampering (false position) | 9.1 CRITICAL | AES-128-GCM authenticated encryption |
| T-2 | Anomaly alert suppression | 8.8 HIGH | HMAC-SHA256 on all alert messages |
| T-3 | Federation gossip poisoning | 7.2 HIGH | Signed Merkle tree roots |
| T-4 | CRC manipulation (forge valid CRC) | 4.5 MEDIUM | CRC insufficient alone → HMAC required |

**CRC vs. HMAC:** The 16-bit CRC in `AUVStateVector.to_bytes()` detects accidental
corruption. For adversarial tampering, HMAC-SHA256 (32 bytes) is required. On a
42-byte state vector, HMAC adds 76% overhead — recommendation: use 8-byte HMAC
(truncated) for acoustic efficiency, accepting reduced collision resistance.

---

### R — Repudiation (Denial of Actions)

| Threat ID | Description | CVSS | Mitigation |
|-----------|-------------|------|-----------|
| R-1 | AUV denies anomaly reports | 5.5 MEDIUM | Signed alerts with timestamp + AUV cert |
| R-2 | Log tampering on support vessel | 4.0 LOW | Append-only log with Merkle hash chain |

---

### I — Information Disclosure (Acoustic Eavesdropping)

**Unique to acoustic domain:** Unlike RF, acoustic signals propagate through water
omnidirectionally. Any hydrophone in range can capture DT state vectors.

| Threat ID | Description | CVSS | Mitigation |
|-----------|-------------|------|-----------|
| I-1 | Acoustic eavesdropping of position data | 7.0 HIGH | AES-128-GCM encryption (encrypt-then-MAC) |
| I-2 | Mission parameter leakage from DT sync | 6.5 HIGH | Encrypt `mission_phase` field |
| I-3 | Fleet topology inference from gossip | 5.0 MEDIUM | Obfuscate AUV count in Merkle announcements |
| I-4 | Discovery traffic analysis | 4.5 MEDIUM | Disable participant enumeration (governance XML) |

**RQ4 measurement:** AES-128-GCM overhead on 42-byte state vector:
- 12-byte nonce + 16-byte authentication tag = 28 bytes overhead
- Total: 70 bytes (67% size increase)
- At 0.5 Hz: 70 × 8 × 0.5 = 280 bps (2.9% of 9600 baud — acceptable)

---

### D — Denial of Service (Acoustic Link Flooding)

**Acoustic amplification:** Low-bandwidth links are trivially flooded.
A single attacker with a standard acoustic modem can overwhelm the
9600-baud link with ~1200 bytes/sec of spoofed traffic.

| Threat ID | Description | CVSS | Mitigation |
|-----------|-------------|------|-----------|
| D-1 | Acoustic link flooding (bandwidth starvation) | 8.5 HIGH | Rate limiting in Zenoh router; circuit breaker |
| D-2 | Discovery storm (repeated SPDP announcements) | 7.0 HIGH | Governance: disable open discovery |
| D-3 | Cryptographic handshake DoS | 6.5 MEDIUM | Session resumption tickets (24-hr validity) |

**Session resumption (RQ4 contribution):** Standard TLS resumption reduces
re-handshake cost from ~5-10 acoustic round-trips to 1 round-trip,
critical for maintaining connectivity during intermittent acoustic links.

---

### E — Elevation of Privilege

| Threat ID | Description | CVSS | Mitigation |
|-----------|-------------|------|-----------|
| E-1 | Unauthorized DDS subscriber gaining mission data | 7.5 HIGH | Per-topic access control (governance XML) |
| E-2 | Privilege escalation via sros2 CLI (Deng V3) | 9.0 CRITICAL | Remove sros2 from deployed AUV; offline key gen |
| E-3 | Supply-chain attack on keystore | 8.0 HIGH | Hardware security module (HSM) for AUV keys |

**Deng et al. V3 acoustic extension:** The `sros2 keystore` exfiltration attack
is more severe in acoustic environments where key rotation is expensive
(requires physical vessel connection or acoustic re-provisioning).

---

## Attack Surface Summary

```
Attack Surface:
├── Acoustic Link (PRIMARY — all traffic)
│   ├── Eavesdropping (I-1, I-2)
│   ├── Replay attacks (S-3)    ← Novel RQ4 contribution
│   ├── Injection/spoofing (S-1, T-1)
│   └── Flooding (D-1)
├── ROS 2 / DDS Layer
│   ├── Participant spoofing (Deng V2)
│   ├── Keystore exfiltration (Deng V3)
│   └── Unauthenticated discovery (Deng V1)
└── Support Vessel (physical)
    ├── Log tampering (R-2)
    └── Key compromise (E-3)
```

---

## Novel RQ4 Contributions vs. Deng et al. (2022)

| Vulnerability | Deng et al. (Terrestrial) | IoRT-DT (Acoustic Extension) |
|---------------|---------------------------|-------------------------------|
| V1: Unauthenticated discovery | Known, mitigated | Mitigation overhead quantified for 9600 baud |
| V2: Participant spoofing | Known | Acoustic cert size optimization (ECDSA vs RSA) |
| V3: Replay attacks | Known | **Acoustic latency ambiguity creates unique attack surface** |
| V4 (NEW): Flooding via DoS | Not characterized | **First measurement of acoustic link flooding** |

---

## Red-Team Test Coverage

| Test | Script | Target |
|------|--------|--------|
| Replay attack (no mitigation) | `scripts/attacks/replay_attack.py` | >80% success rate |
| Replay with mitigation | `scripts/attacks/replay_attack.py` | <5% success rate |
| Spoofing attack | `scripts/attacks/spoofing_attack.py` | Detection in <10s |
| Handshake timing | `experiments/rq4_security/validate.py` | <30s on 9600 baud |
| Encryption overhead | `experiments/rq4_security/validate.py` | <15% bandwidth increase |

Run all: `make red-team`
