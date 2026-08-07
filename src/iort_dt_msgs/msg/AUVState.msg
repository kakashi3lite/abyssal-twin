# AUV State message for digital twin synchronization
# Compressed 47-byte wire format

std_msgs/Header header

# Position (mm resolution, int16 range)
int32 x_mm
int32 y_mm
int32 z_mm

# Orientation (millidegree resolution)
int32 roll_mdeg
int32 pitch_mdeg
int32 yaw_mdeg

# Velocity (mm/s)
int32 vx_mms
int32 vy_mms
int32 vz_mms

# Angular velocity (millidegree/s)
int32 wx_mdegs
int32 wy_mdegs
int32 wz_mdegs

# AUV identification
uint8 auv_id

# Timestamp (nanoseconds)
uint64 timestamp_ns
