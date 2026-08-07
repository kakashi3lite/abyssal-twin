#!/usr/bin/env bash
# Zenoh TLS Certificate Generation for IoRT-DT (Phase 6 — C5 transport security)
#
# Generates an ECDSA P-256 PKI for the Zenoh acoustic transport:
#   configs/security/zenoh/ca_cert.pem         - Certificate Authority (shared)
#   configs/security/zenoh/router_key.pem      - Vessel router private key
#   configs/security/zenoh/router_cert.pem     - Vessel router certificate
#   configs/security/zenoh/gateway_key.pem     - Edge gateway private key
#   configs/security/zenoh/gateway_cert.pem    - Edge gateway certificate
#
# ECDSA P-256 (not RSA) per the RQ4 finding: RSA-2048 ≈ 1164 bytes DER vs
# ECDSA P-256 ≈ 121 bytes DER — an 89% reduction, critical for 9600-baud
# acoustic links that must carry TLS handshakes over the water.
#
# Wire-up (edge-gateway/config.toml):
#   [acoustic.tls]
#   root_ca_certificate   = "${ZENOH_TLS_ROOT_CA}"
#   listen_private_key    = "${ZENOH_TLS_LISTEN_KEY}"
#   listen_certificate    = "${ZENOH_TLS_LISTEN_CERT}"
#   connect_private_key   = "${ZENOH_TLS_CONNECT_KEY}"
#   connect_certificate   = "${ZENOH_TLS_CONNECT_CERT}"
#
# Run: bash scripts/ci/generate_zenoh_tls.sh

set -euo pipefail

SECURITY_DIR="configs/security/zenoh"
mkdir -p "${SECURITY_DIR}"

echo "🔒 Generating Zenoh TLS certificates (ECDSA P-256)..."

# ─── Certificate Authority ────────────────────────────────────────────────────
echo "  ├─ CA key + certificate..."
openssl ecparam -name prime256v1 -genkey -noout -out "${SECURITY_DIR}/ca_key.pem"
openssl req -new -x509 \
    -key "${SECURITY_DIR}/ca_key.pem" \
    -out "${SECURITY_DIR}/ca_cert.pem" \
    -days 3650 \
    -subj "/C=US/ST=Nebraska/O=IoRT-DT/CN=IoRT-DT-Zenoh-CA" \
    -sha256

# ─── Vessel Router (listening side) ──────────────────────────────────────────
echo "  ├─ Router key + certificate..."
openssl ecparam -name prime256v1 -genkey -noout -out "${SECURITY_DIR}/router_key.pem"
openssl req -new \
    -key "${SECURITY_DIR}/router_key.pem" \
    -out /tmp/router.csr \
    -subj "/C=US/ST=Nebraska/O=IoRT-DT/CN=vessel-router" \
    -sha256
openssl x509 -req \
    -in /tmp/router.csr \
    -CA "${SECURITY_DIR}/ca_cert.pem" \
    -CAkey "${SECURITY_DIR}/ca_key.pem" \
    -CAcreateserial \
    -out "${SECURITY_DIR}/router_cert.pem" \
    -days 825 \
    -sha256 \
    -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:172.28.0.10")
rm -f /tmp/router.csr

# ─── Edge Gateway (connecting side) ──────────────────────────────────────────
echo "  ├─ Gateway key + certificate..."
openssl ecparam -name prime256v1 -genkey -noout -out "${SECURITY_DIR}/gateway_key.pem"
openssl req -new \
    -key "${SECURITY_DIR}/gateway_key.pem" \
    -out /tmp/gateway.csr \
    -subj "/C=US/ST=Nebraska/O=IoRT-DT/CN=edge-gateway" \
    -sha256
openssl x509 -req \
    -in /tmp/gateway.csr \
    -CA "${SECURITY_DIR}/ca_cert.pem" \
    -CAkey "${SECURITY_DIR}/ca_key.pem" \
    -CAcreateserial \
    -out "${SECURITY_DIR}/gateway_cert.pem" \
    -days 825 \
    -sha256
rm -f /tmp/gateway.csr

# ─── Verify ──────────────────────────────────────────────────────────────────
echo "  ├─ Verifying chain..."
openssl verify -CAfile "${SECURITY_DIR}/ca_cert.pem" "${SECURITY_DIR}/router_cert.pem"
openssl verify -CAfile "${SECURITY_DIR}/ca_cert.pem" "${SECURITY_DIR}/gateway_cert.pem"

CA_SIZE=$(wc -c < "${SECURITY_DIR}/ca_cert.pem")
echo "  └─ ✅ CA cert: ${CA_SIZE} bytes (ECDSA P-256)"
echo "Generated in ${SECURITY_DIR}/"
