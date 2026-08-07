-- IoRT-DT: Seed data for development and testing.
-- Matches the 3-AUV + support vessel configuration from docker-compose.simulation.yml.

INSERT OR IGNORE INTO vehicles (id, name, type, acoustic_address, status) VALUES
    (0, 'auv_0', 'auv', '0x01', 'offline'),
    (1, 'auv_1', 'auv', '0x02', 'offline'),
    (2, 'auv_2', 'auv', '0x03', 'offline'),
    (10, 'support_vessel', 'support', '0x10', 'offline');

-- Sample mission for testing
INSERT OR IGNORE INTO missions (id, name, status, started_at) VALUES
    ('test-mission-001', 'Development Test Mission', 'planned', datetime('now'));
