"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import {
  buildWorkoutRouteModel,
  type WorkoutRoutePoint,
} from "@/lib/workout-route-model";
import { formatPace, speedMpsToPaceSecPerKm } from "@/lib/workout-trend-model";

export type ActivityRoute3DLabels = {
  reset: string;
  slow: string;
  fast: string;
  unavailable: string;
  elevationScale: string;
  interactiveLabel: string;
  speedUnavailable: string;
  speedUniform: string;
};

function speedLabel(speedMps: number, sport: string) {
  return sport === "RUN"
    ? `${formatPace(speedMpsToPaceSecPerKm(speedMps))}/km`
    : `${(speedMps * 3.6).toFixed(1)} km/h`;
}

export function ActivityRoute3D({
  points,
  sport,
  verticalExaggeration,
  labels,
}: {
  points: WorkoutRoutePoint[];
  sport: string;
  verticalExaggeration: number;
  labels: ActivityRoute3DLabels;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);
  const model = useMemo(
    () =>
      points.length >= 2
        ? buildWorkoutRouteModel(points, verticalExaggeration)
        : null,
    [points, verticalExaggeration],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !model) return;
    let disposed = false;
    let visible = true;
    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x07110f);
      scene.fog = new THREE.FogExp2(0x07110f, 0.00065);
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100_000);
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.replaceChildren(renderer.domElement);

      const geometry = new LineGeometry();
      geometry.setPositions(model.positions.flat());
      geometry.setColors(model.colors.flat());
      const material = new LineMaterial({
        color: 0xffffff,
        linewidth: 5,
        vertexColors: true,
        dashed: false,
      });
      const line = new Line2(geometry, material);
      line.computeLineDistances();
      scene.add(line);

      const box = new THREE.Box3().setFromObject(line);
      const size = box.getSize(new THREE.Vector3());
      const extent = Math.max(size.x, size.y * 1.5, size.z, 50);
      const grid = new THREE.GridHelper(extent * 1.45, 14, 0x1b7566, 0x143e38);
      const floorY = -Math.max(2, size.y * 0.04);
      grid.position.y = floorY;
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.4;
      scene.add(grid);

      const projectionGeometry = new LineGeometry();
      projectionGeometry.setPositions(
        model.positions.flatMap(([x, , z]) => [x, floorY + 0.04, z]),
      );
      const projectionMaterial = new LineMaterial({
        color: 0x34d399,
        linewidth: 1.6,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
      const projection = new Line2(projectionGeometry, projectionMaterial);
      projection.computeLineDistances();
      scene.add(projection);

      const curtainGeometry = new THREE.BufferGeometry();
      const curtainPositions: number[] = [];
      const curtainColors: number[] = [];
      if (model.altitudeAvailable) {
        const pushColor = (
          color: [number, number, number],
          strength: number,
        ) => {
          curtainColors.push(
            color[0] * strength,
            color[1] * strength,
            color[2] * strength,
          );
        };
        for (let index = 0; index < model.positions.length - 1; index += 1) {
          const [x1, y1, z1] = model.positions[index];
          const [x2, y2, z2] = model.positions[index + 1];
          const color1 = model.colors[index];
          const color2 = model.colors[index + 1];
          curtainPositions.push(
            x1,
            y1,
            z1,
            x1,
            floorY,
            z1,
            x2,
            floorY,
            z2,
            x1,
            y1,
            z1,
            x2,
            floorY,
            z2,
            x2,
            y2,
            z2,
          );
          pushColor(color1, 1);
          pushColor(color1, 0.06);
          pushColor(color2, 0.06);
          pushColor(color1, 1);
          pushColor(color2, 0.06);
          pushColor(color2, 1);
        }
      }
      curtainGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(curtainPositions, 3),
      );
      curtainGeometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(curtainColors, 3),
      );
      const curtainMaterial = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const curtain = new THREE.Mesh(curtainGeometry, curtainMaterial);
      scene.add(curtain);

      const guideGeometry = new LineSegmentsGeometry();
      const guideMaterial = new LineMaterial({
        linewidth: 1.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      });
      const guidePositions: number[] = [];
      const guideColors: number[] = [];
      if (model.altitudeAvailable) {
        const interval = Math.max(1, Math.ceil(model.positions.length / 56));
        const guideIndexes = new Set<number>([0, model.positions.length - 1]);
        for (let index = 0; index < model.positions.length; index += interval) {
          guideIndexes.add(index);
        }
        for (const index of [...guideIndexes].toSorted((a, b) => a - b)) {
          const [x, y, z] = model.positions[index];
          const [red, green, blue] = model.colors[index];
          guidePositions.push(x, floorY, z, x, y, z);
          guideColors.push(
            red * 0.12,
            green * 0.12,
            blue * 0.12,
            red,
            green,
            blue,
          );
        }
      }
      guideGeometry.setPositions(guidePositions);
      guideGeometry.setColors(guideColors);
      const guides = new LineSegments2(guideGeometry, guideMaterial);
      guides.computeLineDistances();
      scene.add(guides);

      const start = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(2, extent * 0.012), 18, 12),
        new THREE.MeshBasicMaterial({ color: 0x34d399 }),
      );
      start.position.set(...model.positions[0]);
      scene.add(start);
      const finish = new THREE.Mesh(
        new THREE.ConeGeometry(
          Math.max(2.5, extent * 0.014),
          Math.max(8, extent * 0.05),
          4,
        ),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
      );
      finish.position.set(...model.positions.at(-1)!);
      scene.add(finish);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.autoRotate = !window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      controls.autoRotateSpeed = 0.45;
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.minDistance = extent * 0.25;
      controls.maxDistance = extent * 6;
      const reset = () => {
        camera.position.set(extent * 0.95, extent * 0.72, extent * 1.15);
        camera.near = Math.max(0.1, extent / 10_000);
        camera.far = extent * 20;
        camera.updateProjectionMatrix();
        controls.target.set(0, size.y * 0.18, 0);
        controls.update();
      };
      reset();
      resetRef.current = reset;
      controls.addEventListener("start", () => {
        controls.autoRotate = false;
      });

      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(280, host.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        material.resolution.set(width, height);
        projectionMaterial.resolution.set(width, height);
        guideMaterial.resolution.set(width, height);
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();
      const intersectionObserver = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
      });
      intersectionObserver.observe(host);
      const onVisibility = () => {
        visible = document.visibilityState === "visible";
      };
      document.addEventListener("visibilitychange", onVisibility);
      renderer.setAnimationLoop(() => {
        if (!visible || disposed) return;
        controls.update();
        renderer.render(scene, camera);
      });

      return () => {
        disposed = true;
        resetRef.current = null;
        renderer.setAnimationLoop(null);
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        controls.dispose();
        geometry.dispose();
        material.dispose();
        start.geometry.dispose();
        (start.material as THREE.Material).dispose();
        finish.geometry.dispose();
        (finish.material as THREE.Material).dispose();
        (grid.geometry as THREE.BufferGeometry).dispose();
        (grid.material as THREE.Material).dispose();
        projectionGeometry.dispose();
        projectionMaterial.dispose();
        curtainGeometry.dispose();
        curtainMaterial.dispose();
        guideGeometry.dispose();
        guideMaterial.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    } catch {
      const failureTimer = window.setTimeout(() => setFailed(true), 0);
      return () => window.clearTimeout(failureTimer);
    }
  }, [model]);

  if (failed) {
    return (
      <div className="grid min-h-72 place-items-center text-sm text-neutral-400">
        {labels.unavailable}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-compact border border-emerald-400/15 bg-[#07110f]">
      <div
        ref={hostRef}
        className="h-[320px] w-full sm:h-[460px]"
        role="img"
        aria-label={labels.interactiveLabel}
      />
      <button
        type="button"
        onClick={() => resetRef.current?.()}
        className="absolute right-3 top-3 inline-flex h-9 items-center rounded-compact border border-white/15 bg-black/50 px-3 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        {labels.reset}
      </button>
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-2 rounded-compact bg-black/55 px-3 py-2 text-[11px] font-semibold text-white/85 backdrop-blur">
        {model?.speedRange.variable ? (
          <>
            <span>
              {labels.slow} · {speedLabel(model.speedRange.minimum, sport)}
            </span>
            <span className="h-2 min-w-20 flex-1 rounded-full bg-[linear-gradient(90deg,#7c3aed,#2563eb,#0db8b0,#facc15)]" />
            <span>
              {labels.fast} · {speedLabel(model.speedRange.maximum, sport)}
            </span>
          </>
        ) : (
          <span className="text-white/70">
            {model?.speedRange.available
              ? labels.speedUniform
              : labels.speedUnavailable}
          </span>
        )}
        <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5">
          {labels.elevationScale.includes("{scale}")
            ? labels.elevationScale.replace(
                "{scale}",
                String(verticalExaggeration),
              )
            : `${labels.elevationScale} ×${verticalExaggeration}`}
        </span>
      </div>
    </div>
  );
}
