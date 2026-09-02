"use client";

import { useEffect, useRef, useState } from "react";

type NavigatorHints = Navigator & {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
};

function StaticConstellation() {
  return (
    <svg className="constellation-fallback" viewBox="0 0 720 420" aria-hidden="true" focusable="false">
      <g className="constellation-lines">
        <path d="M112 100 337 94 578 72M108 190 340 178 596 172M124 294 350 270 584 314" />
        <path d="M112 100 108 190 124 294M337 94 340 178 350 270M578 72 596 172 584 314" />
        <path d="M108 190 337 94M124 294 340 178M340 178 578 72M350 270 596 172" />
      </g>
      <g className="constellation-points">
        <circle cx="112" cy="100" r="9" /><circle cx="108" cy="190" r="13" /><circle cx="124" cy="294" r="8" />
        <circle cx="337" cy="94" r="8" /><circle cx="340" cy="178" r="14" /><circle cx="350" cy="270" r="10" />
        <circle cx="578" cy="72" r="10" /><circle cx="596" cy="172" r="15" /><circle cx="584" cy="314" r="9" />
      </g>
    </svg>
  );
}

export function HeroConstellation() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactViewport = window.matchMedia("(max-width: 720px)");
    const navigatorHints = navigator as NavigatorHints;
    if (reducedMotion.matches || compactViewport.matches || navigatorHints.connection?.saveData || (navigatorHints.deviceMemory ?? 8) <= 4) return;

    let disposed = false;
    let disposeScene: (() => void) | undefined;
    const requestIdle = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 180));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;

    const idleId = requestIdle(async () => {
      const THREE = await import("three");
      if (disposed || !mountRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(0, 0, 11);

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
      } catch {
        return;
      }
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.domElement.className = "constellation-canvas";
      renderer.domElement.setAttribute("aria-hidden", "true");
      mount.appendChild(renderer.domElement);

      const nodePositions: number[] = [];
      const nodeColors: number[] = [];
      const bridgePositions: number[] = [];
      const palette = [new THREE.Color("#5fb8a7"), new THREE.Color("#3f8993"), new THREE.Color("#225f78")];
      const clusters: Array<Array<[number, number, number]>> = [[], [], []];

      for (let cluster = 0; cluster < 3; cluster += 1) {
        const centerX = (cluster - 1) * 3.1;
        for (let index = 0; index < 24; index += 1) {
          const angle = index * 2.399963 + cluster * 0.54;
          const radius = 0.26 + ((index * 17) % 19) / 18 * 1.25;
          const x = centerX + Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius * 1.28;
          const z = Math.sin(index * 1.71 + cluster) * 0.42;
          clusters[cluster].push([x, y, z]);
          nodePositions.push(x, y, z);
          nodeColors.push(palette[cluster].r, palette[cluster].g, palette[cluster].b);
        }
      }

      for (let cluster = 0; cluster < clusters.length; cluster += 1) {
        for (let index = 0; index < clusters[cluster].length; index += 1) {
          const from = clusters[cluster][index];
          const to = clusters[cluster][(index + 5) % clusters[cluster].length];
          if (index % 2 === 0) bridgePositions.push(...from, ...to);
        }
      }
      for (let index = 0; index < 12; index += 1) {
        bridgePositions.push(...clusters[0][index * 2], ...clusters[1][(index * 2 + 3) % 24]);
        bridgePositions.push(...clusters[1][index * 2], ...clusters[2][(index * 2 + 5) % 24]);
      }

      const pointGeometry = new THREE.BufferGeometry();
      pointGeometry.setAttribute("position", new THREE.Float32BufferAttribute(nodePositions, 3));
      pointGeometry.setAttribute("color", new THREE.Float32BufferAttribute(nodeColors, 3));
      const points = new THREE.Points(pointGeometry, new THREE.PointsMaterial({ size: 0.105, vertexColors: true, transparent: true, opacity: 0.94, sizeAttenuation: true }));

      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(bridgePositions, 3));
      const lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: 0x4b8f94, transparent: true, opacity: 0.2 }));
      const constellation = new THREE.Group();
      constellation.add(lines, points);
      scene.add(constellation);

      let width = 0;
      let height = 0;
      const resize = () => {
        const bounds = mount.getBoundingClientRect();
        width = Math.max(1, Math.round(bounds.width));
        height = Math.max(1, Math.round(bounds.height));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);

      let pointerX = 0;
      let pointerY = 0;
      const onPointerMove = (event: PointerEvent) => {
        const bounds = mount.getBoundingClientRect();
        pointerX = ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 0.12;
        pointerY = ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 0.08;
      };
      mount.addEventListener("pointermove", onPointerMove, { passive: true });

      let visible = true;
      let frame = 0;
      const render = (time: number) => {
        if (visible && !document.hidden) {
          constellation.rotation.y += (pointerX - constellation.rotation.y) * 0.035;
          constellation.rotation.x += (-pointerY - constellation.rotation.x) * 0.035;
          constellation.position.y = Math.sin(time * 0.00035) * 0.07;
          renderer.render(scene, camera);
        }
        frame = window.requestAnimationFrame(render);
      };
      const intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.05 });
      intersectionObserver.observe(mount);
      frame = window.requestAnimationFrame(render);
      setEnhanced(true);

      disposeScene = () => {
        window.cancelAnimationFrame(frame);
        intersectionObserver.disconnect();
        resizeObserver.disconnect();
        mount.removeEventListener("pointermove", onPointerMove);
        pointGeometry.dispose();
        lineGeometry.dispose();
        (points.material as InstanceType<typeof THREE.PointsMaterial>).dispose();
        (lines.material as InstanceType<typeof THREE.LineBasicMaterial>).dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      cancelIdle(idleId);
      disposeScene?.();
    };
  }, []);

  return (
    <figure className={`hero-constellation${enhanced ? " is-enhanced" : ""}`} role="img" aria-label="Patient facts connect to trial criteria and then to source-traceable clinical trials.">
      <div ref={mountRef} className="constellation-stage">
        <StaticConstellation />
      </div>
      <figcaption>
        <span>Patient facts</span><i aria-hidden="true" /><span>Criteria</span><i aria-hidden="true" /><span>Trials</span>
      </figcaption>
      <p><strong>Taiwan first</strong><span aria-hidden="true">→</span> Asia <span aria-hidden="true">→</span> worldwide</p>
    </figure>
  );
}
