"use client";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// The specimen viewport: one organ at a time, loaded from a Meshopt GLB.
//
// Two rules from the classroom this ships into drive the choices here.
//   1. Render on demand. There is no permanent requestAnimationFrame loop — a
//      frame is drawn only when the camera, the selection or a load changes. An
//      idle specimen costs zero GPU, which on a phone is the difference between
//      a lesson and a flat battery.
//   2. Light background, no dramatic lighting. This reads as a plate from an
//      atlas that happens to turn, and it stays legible in a bright room.

/** Edge of the cube every model is normalised into, so the hotspot coordinates
 *  in anatomyOrgans.ts mean the same thing for all 44 specimens. */
const FIT_SIZE = 3.8;
const DEFAULT_ROT = [0.05, -0.28, 0];
/** Keep the three most recent organs parsed: switching back is then instant. */
const CACHE_LIMIT = 3;

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

export default function AnatomyScene({
  organ,
  hotspotId,
  onPickHotspot,
  handle,
  /** "all" — every hotspot labelled. "quiz" — one unlabelled marker, which is
   *  the whole point of a révision drill: the model has to ask the question. */
  pinMode = "all",
  quizHotspotId = null,
}) {
  const mountRef = useRef(null);
  const pinRef = useRef(null);
  const api = useRef(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | loading | ready | error
  const [pins, setPins] = useState([]);

  // ---- one-time scene construction ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    // Even, top-lit, no rim: the lighting of a diagram rather than a stage.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc4cad6, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(3, 5, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(-5, 1, -4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.35);
    rim.position.set(0, -4, 2);
    scene.add(rim);

    const stage = new THREE.Group();
    scene.add(stage);

    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const cache = new Map();
    let current = null;

    // ---- camera ----
    const cam = { az: 0, pol: Math.PI / 2, dist: 7.4 };
    const goal = { ...cam };
    let animating = false;

    function place() {
      const sp = Math.sin(cam.pol);
      camera.position.set(cam.dist * sp * Math.sin(cam.az), cam.dist * Math.cos(cam.pol), cam.dist * sp * Math.cos(cam.az));
      camera.lookAt(0, 0, 0);
    }

    let queued = false;
    let syncPins = () => {};
    function render() {
      queued = false;
      place();
      renderer.render(scene, camera);
      syncPins();
    }
    function invalidate() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(render);
    }

    function step() {
      const k = 0.17;
      cam.az += (goal.az - cam.az) * k;
      cam.pol += (goal.pol - cam.pol) * k;
      cam.dist += (goal.dist - cam.dist) * k;
      if (
        Math.abs(goal.az - cam.az) < 1e-3 &&
        Math.abs(goal.pol - cam.pol) < 1e-3 &&
        Math.abs(goal.dist - cam.dist) < 0.01
      ) {
        Object.assign(cam, goal);
        animating = false;
        render();
        return;
      }
      render();
      requestAnimationFrame(step);
    }
    function animateTo(next) {
      Object.assign(goal, next);
      if (!animating) {
        animating = true;
        requestAnimationFrame(step);
      }
    }

    // ---- pointer ----
    let drag = null;
    let moved = 0;
    const pointers = new Map();
    let pinchStart = 0;

    function onDown(e) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        drag = null;
        return;
      }
      drag = { x: e.clientX, y: e.clientY };
      moved = 0;
      renderer.domElement.setPointerCapture(e.pointerId);
    }
    function onMove(e) {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 4) {
          goal.dist = cam.dist = THREE.MathUtils.clamp(cam.dist * (pinchStart / d), 2.6, 18);
          pinchStart = d;
          invalidate();
        }
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy);
      cam.az = goal.az = cam.az - dx * 0.008;
      cam.pol = goal.pol = THREE.MathUtils.clamp(cam.pol - dy * 0.006, 0.14, Math.PI - 0.14);
      drag = { x: e.clientX, y: e.clientY };
      invalidate();
    }
    function onUp(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = 0;
      drag = null;
    }
    function onWheel(e) {
      e.preventDefault();
      goal.dist = cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.12), 2.6, 18);
      invalidate();
    }

    const el = renderer.domElement;
    el.style.cursor = "grab";
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      invalidate();
    });
    ro.observe(mount);

    // ---- hotspot pin projection ----
    // Pins are HTML, not sprites: crisp text at any DPI, and they inherit the
    // page's type. Position and occlusion are recomputed on each drawn frame,
    // which only happens when something actually moved.
    const world = new THREE.Vector3();
    const proj = new THREE.Vector3();
    const ray = new THREE.Raycaster();
    const camDir = new THREE.Vector3();

    syncPins = () => {
      const host = pinRef.current;
      if (!host || !current) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      for (const node of host.children) {
        const i = Number(node.dataset.i);
        const hs = current.organ.hotspots[i];
        if (!hs) continue;
        world.set(hs.position[0], hs.position[1], hs.position[2]).applyMatrix4(current.pivot.matrixWorld);
        proj.copy(world).project(camera);

        // Hidden when it projects behind the camera, or when the specimen's own
        // geometry stands between it and the viewer — a label floating over the
        // far side of a kidney points at nothing.
        //
        // The révision marker is exempt. Several hotspots sit at or just inside
        // the surface (the mitral valve is deep in the heart), so the occlusion
        // test hides them — and a drill that asks "which structure is marked?"
        // with no visible mark is unanswerable. Showing it always is strictly
        // better than a correct-but-useless hidden dot.
        let visible = proj.z < 1;
        if (visible && node.dataset.always !== "1") {
          camDir.copy(world).sub(camera.position);
          const dist = camDir.length();
          ray.set(camera.position, camDir.normalize());
          ray.far = dist - 0.12;
          visible = ray.intersectObjects(current.meshes, false).length === 0;
        }
        node.style.opacity = visible ? "1" : "0";
        node.style.pointerEvents = visible ? "auto" : "none";
        node.style.transform = `translate(-50%,-50%) translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px)`;
      }
    };

    // ---- organ loading ----
    async function show(organDef, onDone) {
      if (!organDef?.model) return;
      const url = organDef.model;
      if (current) {
        current.pivot.removeFromParent();
        current = null;
      }
      const hit = cache.get(url);
      if (hit) {
        cache.delete(url);
        cache.set(url, hit);
        current = hit;
        hit.pivot.rotation.set(...(organDef.rotation ?? DEFAULT_ROT));
        stage.add(hit.pivot);
        onDone?.(hit);
        invalidate();
        return;
      }

      const gltf = await loader.loadAsync(url, (e) => {
        if (e.total > 0) api.current?.emitProgress(e.loaded / e.total);
      });
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = FIT_SIZE / Math.max(size.x, size.y, size.z, 0.001);
      model.scale.setScalar(scale);
      model.position.copy(center.multiplyScalar(-scale));

      const pivot = new THREE.Group();
      pivot.add(model);
      pivot.rotation.set(...(organDef.rotation ?? DEFAULT_ROT));

      const meshes = [];
      const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      model.traverse((child) => {
        if (!child.isMesh) return;
        meshes.push(child);
        // One centred specimen: culling can only ever cost a wrong answer here.
        child.frustumCulled = false;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (!m) continue;
          m.side = THREE.FrontSide;
          if (m.isMeshStandardMaterial) {
            // Holding roughness up and killing the second specular lobe is what
            // stops highlights from crawling while the organ turns.
            m.roughness = THREE.MathUtils.clamp(m.roughness ?? 0.5, 0.42, 0.62);
            m.metalness = 0;
            if ("transmission" in m) {
              m.transmission = 0;
              m.thickness = 0;
            }
            for (const map of [m.map, m.normalMap, m.roughnessMap, m.aoMap, m.emissiveMap]) {
              if (!map) continue;
              map.anisotropy = maxAniso;
              map.needsUpdate = true;
            }
          }
          m.needsUpdate = true;
        }
      });

      const entry = { url, organ: organDef, pivot, meshes };
      cache.set(url, entry);
      while (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        const dead = cache.get(oldest);
        cache.delete(oldest);
        if (dead && dead !== entry) {
          dead.pivot.removeFromParent();
          dead.pivot.traverse((o) => {
            if (!o.isMesh) return;
            o.geometry?.dispose();
            const mm = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mm) {
              for (const k of ["map", "normalMap", "roughnessMap", "aoMap", "emissiveMap"]) m?.[k]?.dispose?.();
              m?.dispose?.();
            }
          });
        }
      }
      current = entry;
      stage.add(pivot);
      onDone?.(entry);
      invalidate();
    }

    api.current = {
      show,
      invalidate,
      emitProgress: () => {},
      resetView: () => animateTo({ az: 0, pol: Math.PI / 2, dist: 7.4 }),
      setView: (name) => {
        const az = name === "dos" ? Math.PI : name === "profil" ? Math.PI / 2 : 0;
        animateTo({ az, pol: Math.PI / 2, dist: goal.dist });
      },
      // Swing the model round so the hotspot faces the viewer, then close in.
      //
      // Azimuth only, with a gentle nod. Deriving the polar angle from the
      // hotspot's own elevation looks right on paper and is wrong in practice:
      // a structure near the vertical axis — the pelvis of a whole skeleton —
      // has almost no horizontal radius, so the angle collapses and the camera
      // ends up under the specimen looking up. Eye level is what a learner
      // expects, so it stays put.
      focusHotspot: (hs) => {
        if (!current || !hs) return;
        const v = new THREE.Vector3(...hs.position).applyEuler(current.pivot.rotation);
        const r = Math.hypot(v.x, v.z);
        const nod = THREE.MathUtils.clamp(Math.PI / 2 - v.y * 0.16, 1.15, 1.95);
        animateTo({
          az: r > 0.15 ? Math.atan2(v.x, v.z) : goal.az,
          pol: nod,
          dist: 5.6,
        });
      },
      snapshot: () => renderer.domElement.toDataURL("image/png"),
    };

    place();
    invalidate();

    return () => {
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      for (const entry of cache.values()) {
        entry.pivot.traverse((o) => {
          if (!o.isMesh) return;
          o.geometry?.dispose();
          const mm = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mm) m?.dispose?.();
        });
      }
      cache.clear();
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
      api.current = null;
    };
  }, []);

  useEffect(() => {
    if (api.current) api.current.emitProgress = (p) => setProgress(p);
  }, []);

  useImperativeHandle(handle, () => ({
    reset: () => api.current?.resetView(),
    view: (n) => api.current?.setView(n),
    focusHotspot: (hs) => api.current?.focusHotspot(hs),
    snapshot: () => api.current?.snapshot() ?? null,
  }));

  // ---- load whenever the chosen organ changes ----
  useEffect(() => {
    const a = api.current;
    if (!a || !organ?.model) return;
    let alive = true;
    setPhase("loading");
    setProgress(0);
    setPins([]);
    a.show(organ, () => {
      if (!alive) return;
      setPins(organ.hotspots.map((h, i) => ({ ...h, i })));
      setPhase("ready");
      a.resetView();
    }).catch(() => {
      if (!alive) return;
      setPhase("error");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organ?.id]);

  // Pins mount without a transform, so they would flash at the top-left corner
  // until the next camera move. Ask for that frame.
  useEffect(() => {
    api.current?.invalidate();
  }, [pins, hotspotId, pinMode, quizHotspotId]);

  const shown = phase !== "ready" ? [] : pinMode === "quiz" ? pins.filter((h) => h.id === quizHotspotId) : pins;

  return (
    <div className="an-viewport" ref={mountRef}>
      <div className="an-pins" ref={pinRef}>
        {shown.map((h) => (
          <button
            key={h.id}
            data-i={h.i}
            data-always={pinMode === "quiz" ? "1" : undefined}
            className={`an-pin${hotspotId === h.id ? " is-sel" : ""}${pinMode === "quiz" ? " is-quiz" : ""}`}
            style={{ "--pin": h.color }}
            onClick={() => pinMode !== "quiz" && onPickHotspot?.(h.id)}
            title={pinMode === "quiz" ? "Structure à identifier" : h.label}
          >
            <span className="an-pin-dot" />
            {pinMode !== "quiz" && <span className="an-pin-txt">{h.label}</span>}
          </button>
        ))}
      </div>

      {phase === "loading" && (
        <div className="an-load">
          <div className="an-load-bar">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p>Chargement du spécimen… {Math.round(progress * 100)} %</p>
        </div>
      )}
      {phase === "error" && (
        <div className="an-load">
          <p>Ce spécimen n'a pas pu être chargé depuis le serveur local.</p>
        </div>
      )}
    </div>
  );
}
