# Security Policy

## Supported Versions

| Version | Supported          | End of Life |
| ------- | ------------------ | ----------- |
| 0.1.x   | :white_check_mark: | TBD         |
| < 0.1.0 | :x:                | N/A (dev)   |

## Reporting a Vulnerability

If you discover a security vulnerability in abyssal-twin, please report it responsibly:

1. **DO NOT** open a public GitHub issue
2. Email: s.tanavade@unomaha.edu with subject `[SECURITY] abyssal-twin`
3. Include:
   - Description of the vulnerability
   - Steps to reproduce (if applicable)
   - Potential impact assessment
   - Suggested fix (if known)

**Response Timeline:**
- Acknowledgment: Within 48 hours
- Initial assessment: Within 1 week
- Fix released: Within 30 days (critical), 90 days (high)
- Public disclosure: After fix released

## Security Scanning

This repository uses automated security scanning:

- **Trivy**: Container image and filesystem vulnerability scanning
- **Dependabot**: Automated dependency updates
- **GitHub Secret Scanning**: Prevents accidental secret commits
- **SARIF Uploads**: Results visible in GitHub Security tab

### Viewing Security Alerts

1. Go to **Security** → **Code scanning alerts**
2. Review Trivy findings
3. Dependabot alerts appear under **Security** → **Dependabot alerts**

## SLSA Provenance

All container images are built with SLSA Level 3 provenance:

```bash
# Verify image signature
cosign verify \
  --certificate-identity-regexp="https://github.com/kakashi3lite/abyssal-twin/.github/workflows/.*" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/kakashi3lite/abyssal-twin/simulation:v0.1.0-alpha

# View SBOM
docker sbom ghcr.io/kakashi3lite/abyssal-twin/simulation:v0.1.0-alpha
```

## Security-Related Configuration

### DDS-Security

For RQ4 (DDS-Security) validation, the repository includes:
- Certificate generation scripts (`scripts/ci/generate_certs.sh`)
- Governance templates (`configs/security/governance.xml.template`)
- Attack simulation scripts (`scripts/attacks/`)

**Production Use:** Replace example certificates before deployment.

### Default Credentials

| Service | Default | Production Action Required |
|---------|---------|---------------------------|
| Grafana | admin/admin | Change immediately |
| Zenoh | N/A (open) | Configure authentication |

## CVE Response Process

1. Trivy detects CVE in base image or dependency
2. Automatic PR created by Dependabot (if fix available)
3. Critical CVEs block releases (circuit breaker in CI)
4. Security advisory published for confirmed vulnerabilities

## Security Hardening Checklist

Before production deployment:

- [ ] Replace all default passwords
- [ ] Generate new DDS-Security certificates
- [ ] Enable ROS 2 security enclaves
- [ ] Configure network segmentation (acoustic net isolated)
- [ ] Review firewall rules for Zenoh router
- [ ] Enable audit logging
- [ ] Verify image signatures with cosign

## Related Security Documentation

- [Threat Model](docs/security/threat_model.md)
- [DDS-Security Configuration](configs/security/)
- [Attack Simulation Scripts](scripts/attacks/)

## Acknowledgments

Security researchers who have responsibly disclosed vulnerabilities will be acknowledged in release notes (unless they prefer anonymity).

---

*This security policy follows the [GitHub Security Policy](https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository) best practices.*
