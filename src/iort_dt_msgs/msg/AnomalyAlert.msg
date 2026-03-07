# Anomaly detection alert

std_msgs/Header header

# AUV that reported anomaly
uint8 auv_id

# Anomaly type
uint8 ANOMALY_THRUSTER=0
uint8 ANOMALY_SENSOR=1
uint8 ANOMALY_COMMUNICATION=2
uint8 ANOMALY_BUOYANCY=3

uint8 anomaly_type

# Severity (0.0 - 1.0)
float32 severity

# Detection timestamp
uint64 detection_timestamp_ns

# Description
string description
