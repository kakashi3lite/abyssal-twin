// 3D Fleet Visualization using Three.js via @react-three/fiber.
// Renders AUV positions in an underwater scene.

import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Grid } from "@react-three/drei";
import * as THREE from "three";

interface VehicleStatus {
  id: number;
  name: string;
  type: "auv" | "usv" | "support";
  status: "online" | "partitioned" | "offline";
  latestState: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    anomalyDetected: boolean;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  online: "#22c55e",
  partitioned: "#eab308",
  offline: "#6b7280",
};

/** Individual AUV mesh with pulsing animation. */
function AUVMesh({
  vehicle,
}: {
  vehicle: VehicleStatus;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const state = vehicle.latestState;

  // Gentle bobbing animation
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  if (!state) return null;

  const color = vehicle.latestState?.anomalyDetected
    ? "#ef4444"
    : STATUS_COLORS[vehicle.status] ?? "#6b7280";

  // Scale z for visualization (underwater depth is negative)
  const position: [number, number, number] = [
    state.x * 0.1,
    state.z * 0.1,
    state.y * 0.1,
  ];

  return (
    <group position={position}>
      {/* AUV body — elongated capsule shape */}
      <mesh ref={meshRef} rotation={[0, state.yaw, 0]}>
        {vehicle.type === "support" ? (
          <boxGeometry args={[0.8, 0.3, 0.4]} />
        ) : (
          <capsuleGeometry args={[0.12, 0.4, 8, 16]} />
        )}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          transparent
          opacity={vehicle.status === "offline" ? 0.3 : 0.9}
        />
      </mesh>

      {/* Label */}
      <Text
        position={[0, 0.5, 0]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="bottom"
      >
        {vehicle.name}
      </Text>

      {/* Uncertainty ring (proportional to position variance) */}
      {state.anomalyDetected && (
        <mesh position={[0, 0, 0]}>
          <ringGeometry args={[0.3, 0.35, 32]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/** Water surface plane. */
function WaterSurface() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial
        color="#0087b9"
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function FleetMap({ vehicles }: { vehicles: VehicleStatus[] }) {
  return (
    <Canvas
      camera={{ position: [5, 3, 5], fov: 60 }}
      style={{ background: "linear-gradient(180deg, #001319 0%, #003041 100%)" }}
    >
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} />

      {/* Water surface reference plane */}
      <WaterSurface />

      {/* Seabed grid */}
      <Grid
        position={[0, -3, 0]}
        args={[20, 20]}
        cellColor="#004d69"
        sectionColor="#006a91"
        fadeDistance={15}
        cellSize={1}
        sectionSize={5}
      />

      {/* Render each vehicle */}
      {vehicles.map((v) => (
        <AUVMesh key={v.id} vehicle={v} />
      ))}

      {/* Camera controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        maxPolarAngle={Math.PI * 0.85}
        minDistance={2}
        maxDistance={20}
      />
    </Canvas>
  );
}
