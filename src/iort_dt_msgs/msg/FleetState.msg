# Fleet-wide state aggregation

std_msgs/Header header

# Number of AUVs in fleet
uint8 fleet_size

# Individual AUV states
AUVState[] states

# Fleet coherence metrics
float32 formation_rms_error_m
