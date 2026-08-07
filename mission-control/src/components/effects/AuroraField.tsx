/**
 * AuroraField — WebGPU ambient sonar/aurora backdrop with Canvas2D fallback.
 *
 * Technique map (WIREFRAMES_V3.md §4):
 *  - WebGPU: WGSL fragment shader renders a procedural aurora/sonar field.
 *  - Fallback: Canvas2D gradient animation when navigator.gpu is absent or
 *    device acquisition fails (older Safari/FF).
 *  - prefers-reduced-motion: renders a single static frame (no rAF loop).
 *
 * The canvas sits behind the grid (fixed, -z, pointer-events-none) so it never
 * intercepts interactions.
 *
 * Note on types: TS lib.dom does not ship WebGPU types, so the GPU objects are
 * intentionally typed `any` here with numeric usage flags (UNIFORM=0x4,
 * COPY_DST=0x8). The feature-detect + try/catch keeps this fully optional.
 */
import React, { useEffect, useRef } from "react";

/** Minimal WGSL fragment shader — aurora bands derived from time + position. */
const WGSL = /* wgsl */ `
struct Uniforms {
  time: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VsOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 1.0));
  let uv = (p[idx] + 1.0) * 0.5;
  return VsOut(vec4f(p[idx], 0.0, 1.0), uv);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = u.time;
  // Abyssal aurora: layered sine bands in bio-cyan / teal / deep blue.
  let wave = sin(uv.x * 6.0 + t * 0.6) * 0.5 + 0.5;
  let band = sin(uv.y * 12.0 + t * 0.25 + wave * 3.0) * 0.5 + 0.5;
  let cyan = vec3f(0.0, 0.90, 1.0);
  let teal = vec3f(0.0, 0.71, 0.85);
  let deep = vec3f(0.02, 0.05, 0.12);
  var c = mix(deep, teal, band * 0.7);
  c = mix(c, cyan, wave * band * 0.25);
  return vec4f(c, 0.35);
}
`;

// WebGPU buffer usage flags (numeric — avoids needing @webgpu/types).
const USAGE_UNIFORM = 0x4;
const USAGE_COPY_DST = 0x8;

export const AuroraField: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const raw = canvasRef.current;
    if (!raw) return;
    // Non-null const bindings — TS keeps these narrowed inside closures.
    const canvas: HTMLCanvasElement = raw;
    const ctx: CanvasRenderingContext2D = canvas.getContext("2d")!;
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let disposed = false;

    // ── Resize to device pixels ────────────────────────────────────────────
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    // ── WebGPU path ────────────────────────────────────────────────────────
    async function webgpuPath() {
      const nav = navigator as Navigator & { gpu?: any };
      if (!nav.gpu) throw new Error("no WebGPU");
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) throw new Error("no adapter");
      const device = await adapter.requestDevice();
      const module = device.createShaderModule({ code: WGSL });
      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vs_main" },
        fragment: { module, entryPoint: "fs_main", targets: [{ format: "bgra8unorm" }] },
        primitive: { topology: "triangle-list" },
      });

      const timeBuf = device.createBuffer({
        size: 4,
        usage: USAGE_UNIFORM | USAGE_COPY_DST,
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: timeBuf } }],
      });

      const gpuCtx = canvas.getContext("webgpu") as any;
      if (!gpuCtx) throw new Error("no webgpu context");
      gpuCtx.configure({ format: "bgra8unorm", alphaMode: "premultiplied" });

      const start = performance.now();
      const frame = (now: number) => {
        if (disposed) return;
        const t = (now - start) / 1000;
        device.queue.writeBuffer(timeBuf, 0, new Float32Array([t]));
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: gpuCtx.getCurrentTexture().createView(),
              clearValue: { r: 0.02, g: 0.05, b: 0.12, a: 1 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }

    // ── Canvas2D fallback path ─────────────────────────────────────────────
    function canvas2dPath() {
      const start = performance.now();
      const draw = (now: number) => {
        if (disposed) return;
        const t = (now - start) / 1000;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Layered aurora bands (bio-cyan on deep abyss).
        for (let i = 0; i < 3; i++) {
          const y0 = h * (0.35 + i * 0.18);
          const grad = ctx.createLinearGradient(0, y0 - 40, 0, y0 + 40);
          const alpha = 0.1 + 0.06 * Math.sin(t * 0.6 + i * 1.7);
          grad.addColorStop(0, "rgba(0, 229, 255, 0)");
          grad.addColorStop(0.5, `rgba(0, 180, 216, ${alpha})`);
          grad.addColorStop(1, "rgba(0, 229, 255, 0)");
          ctx.fillStyle = grad;
          const wobble = Math.sin(t * 0.3 + i * 2.1) * 30;
          ctx.beginPath();
          ctx.moveTo(0, y0);
          for (let x = 0; x <= w; x += 16) {
            ctx.lineTo(x, y0 + Math.sin(x * 0.02 + t * 0.5 + i) * 12 + wobble);
          }
          ctx.lineTo(w, y0 + 40);
          ctx.lineTo(0, y0 + 40);
          ctx.closePath();
          ctx.fill();
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    }

    if (reduced) {
      // Single static frame — no animation loop.
      webgpuPath().catch(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, "rgba(0, 229, 255, 0.15)");
        grad.addColorStop(1, "rgba(0, 180, 216, 0.05)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });
    } else {
      webgpuPath().catch((err) => {
        console.info("AuroraField: WebGPU unavailable, Canvas2D fallback:", err);
        canvas2dPath();
      });
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 -z-10 h-full w-full pointer-events-none opacity-70"
    />
  );
};
