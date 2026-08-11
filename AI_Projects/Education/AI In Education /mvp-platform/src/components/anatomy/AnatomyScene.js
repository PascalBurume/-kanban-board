"use client";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { tween, easeInOutCubic } from "@/lib/anatomyTween";

// The specimen viewport: one organ at a time, from a Meshopt GLB.
//
// Ported from the explorer's app/lib/three/viewer.ts, including the two things
// my first version got wrong.
//
// ROTATION. OrbitControls with damping, not a hand-rolled orbit. The first
// version drew exactly one frame per pointermove and none after release, so the
// model tracked the finger and then stopped dead — no glide, and any dropped
// event read as a stutter. `controls.update()` returns true while damping is
// still settling, which is what carries the motion past the last event.
//
// BATTERY. Damping needs a running loop, but a running loop must not mean a
// running GPU. The loop below is always scheduled and renders only when `dirty`
// — set by interaction, by damping still settling, and by any tween in flight.
// An idle specimen therefore still costs nothing, and the loop is unscheduled
// altogether when the canvas scrolls out of view or the tab is hidden.

/** Edge of the cube every model is normalised into, so the hotspot coordinates
 *  in anatomyOrgans.ts mean the same thing for all 44 specimens. */
const FIT_SIZE = 3.8;
const DEFAULT_ROT = [0.05, -0.28, 0];
const CACHE_LIMIT = 3;
/** Far enough out that nothing is clipped; the sweep runs from here to 0. */
const CLIP_OPEN = 2.6;

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
  /** "all" — every hotspot named. "blank" — numbered anonymous markers, for a
   *  drill where naming them is the exercise. "one" — a single blank marker. */
  pinMode = "all",
  /** In "one" mode, which hotspot to mark. */
  soloHotspotId = null,
  /** id -> "right" | "wrong", painted onto the markers after a calque is checked. */
  marks = null,
  autoRotate = false,
  wireframe = false,
  crossSection = false,
}) {
  const mountRef = useRef(null);
  const pinRef = useRef(null);
  const api = useRef(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("idle");
  const [pins, setPins] = useState([]);

  // ---- one-time scene construction ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Decided once. The classroom device is the constraint: a phone, or a shared
    // laptop with four cores. Full DPR with MSAA on those is the difference
    // between a smooth turn and a slideshow, and nobody can see it at 42 mm.
    const lowPower =
      window.matchMedia("(max-width: 780px)").matches || (navigator.hardwareConcurrency ?? 8) < 6;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    camera.position.set(0, 0, 7.4);

    const renderer = new THREE.WebGLRenderer({
      antialias: !lowPower,
      alpha: true,
      powerPreference: "low-power",
      stencil: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.localClippingEnabled = true;
    renderer.domElement.setAttribute(
      "aria-label",
      "Modèle 3D interactif. Faites glisser pour tourner, la molette pour zoomer, et touchez une pastille pour lire la structure.",
    );
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);

    // Even and top-lit — the lighting of an anatomical plate, not of a stage.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cec2, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.65);
    fill.position.set(-5, 1, -4);
    scene.add(fill);
    const under = new THREE.DirectionalLight(0xffffff, 0.3);
    under.position.set(0, -4, 2);
    scene.add(under);

    const stage = new THREE.Group();
    scene.add(stage);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.minDistance = 4.6;
    controls.maxDistance = 12;
    controls.autoRotateSpeed = 0.65;
    controls.target.set(0, 0, 0);

    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), CLIP_OPEN);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const cache = new Map();
    let current = null;
    let disposed = false;

    // ---- the loop ----
    let dirty = true;
    let raf = 0;
    let visible = true;
    let pageVisible = !document.hidden;
    let busyUntil = 0;
    let autoRotateWanted = false;
    let interactionUntil = 0;
    let syncPins = () => {};

    const markDirty = () => {
      dirty = true;
    };
    /** Hold the loop awake for a stretch — used while a tween is running. */
    const busy = (seconds) => {
      busyUntil = Math.max(busyUntil, performance.now() + seconds * 1000);
      dirty = true;
    };

    function frame() {
      raf = requestAnimationFrame(frame);
      const now = performance.now();

      // Auto-rotation yields to the student: it stops the moment they touch the
      // model and stays off while a structure is open.
      controls.autoRotate = autoRotateWanted && now >= interactionUntil;

      // update() returns true while damping (or auto-rotation) is still moving
      // the camera, which is exactly the condition for needing another frame.
      const moving = controls.update();
      if (moving || now < busyUntil) dirty = true;
      if (!dirty) return;

      dirty = false;
      renderer.render(scene, camera);
      syncPins();
    }

    function startLoop() {
      if (raf || !visible || !pageVisible) return;
      dirty = true;
      raf = requestAnimationFrame(frame);
    }
    function stopLoop() {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        visible ? startLoop() : stopLoop();
      },
      { rootMargin: "120px" },
    );
    io.observe(mount);

    const onVisibility = () => {
      pageVisible = !document.hidden;
      pageVisible ? startLoop() : stopLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onControlStart = () => {
      interactionUntil = performance.now() + 2600;
      dirty = true;
    };
    controls.addEventListener("start", onControlStart);
    controls.addEventListener("change", markDirty);

    const ro = new ResizeObserver(() => {
      const w = Math.max(mount.clientWidth, 1);
      const h = Math.max(mount.clientHeight, 1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
    });
    ro.observe(mount);

    // ---- hotspot labels ----
    // The chip is pushed away from the model's centre and joined to its anchor
    // by a leader line, so a name never sits on top of the structure it names.
    const world = new THREE.Vector3();
    const proj = new THREE.Vector3();
    const ray = new THREE.Raycaster();
    const toPoint = new THREE.Vector3();

    syncPins = () => {
      const host = pinRef.current;
      if (!host || !current) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      for (const node of host.children) {
        const hs = current.organ.hotspots[Number(node.dataset.i)];
        if (!hs) continue;
        world.set(hs.position[0], hs.position[1], hs.position[2]).applyMatrix4(current.pivot.matrixWorld);
        proj.copy(world).project(camera);

        let shown = proj.z < 1;
        // A marker the student is being asked to identify is exempt from the
        // occlusion test: several hotspots sit at or just inside the surface,
        // and a drill with no visible mark is unanswerable.
        if (shown && node.dataset.always !== "1") {
          toPoint.copy(world).sub(camera.position);
          const dist = toPoint.length();
          ray.set(camera.position, toPoint.normalize());
          ray.far = dist - 0.12;
          shown = ray.intersectObjects(current.meshes, false).length === 0;
        }
        node.dataset.visible = shown ? "true" : "false";
        if (!shown) continue;

        const x = ((proj.x + 1) / 2) * w;
        const y = ((1 - proj.y) / 2) * h;
        node.style.transform = `translate(${x}px, ${y}px)`;

        const side = x > w / 2 ? 1 : -1;
        const dx = side * 36;
        const dy = -20;
        const chip = node.lastElementChild;
        const line = node.firstElementChild;
        if (chip) chip.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
        if (line) {
          line.style.width = `${Math.hypot(dx, dy)}px`;
          line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
        }
      }
    };

    // ---- materials / tools ----
    const materialsOf = (entry) => {
      const out = [];
      for (const mesh of entry?.meshes ?? []) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) if (m) out.push(m);
      }
      return out;
    };

    let cancelClip = null;
    function applyCrossSection(on) {
      if (!current) return;
      const mats = materialsOf(current);
      for (const m of mats) {
        m.clippingPlanes = on || clipPlane.constant < CLIP_OPEN ? [clipPlane] : null;
        m.needsUpdate = true;
      }
      cancelClip?.();
      cancelClip = tween({
        from: clipPlane.constant,
        to: on ? 0 : CLIP_OPEN,
        duration: 0.75,
        ease: easeInOutCubic,
        onUpdate: (v) => {
          clipPlane.constant = v;
          dirty = true;
        },
        onComplete: () => {
          if (!on) for (const m of materialsOf(current)) (m.clippingPlanes = null), (m.needsUpdate = true);
          dirty = true;
        },
      });
      busy(0.85);
    }

    function applyWireframe(on) {
      for (const m of materialsOf(current)) {
        if (m.isMeshStandardMaterial) m.wireframe = on;
      }
      dirty = true;
    }

    // ---- loading ----
    async function show(organDef, onDone) {
      if (!organDef?.model) return;
      const url = organDef.model;
      if (current) {
        current.pivot.removeFromParent();
        current = null;
      }
      clipPlane.constant = CLIP_OPEN;

      const hit = cache.get(url);
      if (hit) {
        cache.delete(url);
        cache.set(url, hit);
        current = hit;
        hit.pivot.rotation.set(...(organDef.rotation ?? DEFAULT_ROT));
        stage.add(hit.pivot);
        onDone?.(hit);
        dirty = true;
        return;
      }

      const gltf = await loader.loadAsync(url, (e) => {
        if (e.total > 0) api.current?.emitProgress(e.loaded / e.total);
      });
      if (disposed) return;

      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const scale = FIT_SIZE / Math.max(size.x, size.y, size.z, 0.001);
      model.scale.setScalar(scale);
      model.position.copy(centre.multiplyScalar(-scale));

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
            // stops highlights crawling while the organ turns.
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
        const oldestKey = cache.keys().next().value;
        const dead = cache.get(oldestKey);
        cache.delete(oldestKey);
        if (dead && dead !== entry) disposeEntry(dead);
      }
      current = entry;
      stage.add(pivot);
      onDone?.(entry);
      dirty = true;
    }

    function disposeEntry(entry) {
      entry.pivot.removeFromParent();
      entry.pivot.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          for (const k of ["map", "normalMap", "roughnessMap", "aoMap", "emissiveMap"]) m?.[k]?.dispose?.();
          m?.dispose?.();
        }
      });
    }

    api.current = {
      show,
      emitProgress: () => {},
      markDirty,
      setAutoRotate: (on) => {
        autoRotateWanted = on;
        if (on) interactionUntil = 0;
        dirty = true;
      },
      setWireframe: applyWireframe,
      setCrossSection: applyCrossSection,
      resetView: () => {
        api.current?.frameTo(0, Math.PI / 2, 7.4);
      },
      setView: (name) => {
        const az = name === "dos" ? Math.PI : name === "profil" ? Math.PI / 2 : 0;
        const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        api.current?.frameTo(az, sph.phi, sph.radius);
      },
      /** Eased camera move in spherical space around the target. */
      frameTo: (az, pol, dist) => {
        const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        const dAz = ((az - from.theta + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        const target = new THREE.Spherical(
          THREE.MathUtils.clamp(dist, controls.minDistance, controls.maxDistance),
          THREE.MathUtils.clamp(pol, 0.16, Math.PI - 0.16),
          from.theta + dAz,
        );
        interactionUntil = performance.now() + 2600;
        busy(0.75);
        tween({
          from: 0,
          to: 1,
          duration: 0.62,
          ease: easeInOutCubic,
          onUpdate: (t) => {
            const s = new THREE.Spherical(
              from.radius + (target.radius - from.radius) * t,
              from.phi + (target.phi - from.phi) * t,
              from.theta + (target.theta - from.theta) * t,
            );
            camera.position.setFromSpherical(s).add(controls.target);
            camera.lookAt(controls.target);
            dirty = true;
          },
        });
      },
      // Swing the model round so the structure faces the viewer, then close in.
      // Azimuth only, with a gentle nod: deriving the polar angle from the
      // hotspot's own elevation puts the camera under the specimen whenever the
      // structure sits near the vertical axis, as the pelvis of a skeleton does.
      focusHotspot: (hs) => {
        if (!current || !hs) return;
        const v = new THREE.Vector3(...hs.position).applyEuler(current.pivot.rotation);
        const r = Math.hypot(v.x, v.z);
        const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        api.current?.frameTo(
          r > 0.15 ? Math.atan2(v.x, v.z) : sph.theta,
          THREE.MathUtils.clamp(Math.PI / 2 - v.y * 0.16, 1.15, 1.95),
          5.6,
        );
      },
      /** Test hook: how many frames the renderer has actually drawn. */
      frameCount: () => renderer.info.render.frame,
    };

    startLoop();

    return () => {
      disposed = true;
      stopLoop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      controls.removeEventListener("start", onControlStart);
      controls.removeEventListener("change", markDirty);
      controls.dispose();
      cancelClip?.();
      for (const entry of cache.values()) disposeEntry(entry);
      cache.clear();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      api.current = null;
    };
  }, []);

  useEffect(() => {
    if (api.current) api.current.emitProgress = setProgress;
  }, []);

  useImperativeHandle(handle, () => ({
    reset: () => api.current?.resetView(),
    view: (n) => api.current?.setView(n),
    focusHotspot: (hs) => api.current?.focusHotspot(hs),
    frameCount: () => api.current?.frameCount() ?? 0,
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
      a.setWireframe(wireframe);
      if (crossSection) a.setCrossSection(true);
    }).catch(() => {
      if (alive) setPhase("error");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organ?.id]);

  useEffect(() => {
    api.current?.setAutoRotate(autoRotate);
  }, [autoRotate]);
  useEffect(() => {
    if (phase === "ready") api.current?.setWireframe(wireframe);
  }, [wireframe, phase]);
  useEffect(() => {
    if (phase === "ready") api.current?.setCrossSection(crossSection);
  }, [crossSection, phase]);

  // A pin mounts without a transform, so it would flash at the corner until the
  // next camera move. Ask for the frame that places it.
  useEffect(() => {
    api.current?.markDirty();
  }, [pins, hotspotId, pinMode, soloHotspotId, marks]);

  const shown =
    phase !== "ready" ? [] : pinMode === "one" ? pins.filter((h) => h.id === soloHotspotId) : pins;
  const blank = pinMode !== "all";

  return (
    <div className="an-viewport" ref={mountRef}>
      <div className="an-pins" ref={pinRef}>
        {shown.map((h) => {
          const mark = marks?.[h.id];
          // The number ties a marker to its row in the calque, so it must be the
          // hotspot's own index, not its position in the filtered list.
          const face = pinMode === "one" ? "?" : h.i + 1;
          return (
            <span
              key={h.id}
              data-i={h.i}
              data-always={blank ? "1" : undefined}
              data-visible="false"
              className={`an-pin${hotspotId === h.id ? " is-sel" : ""}${blank ? " is-blank" : ""}${
                pinMode === "one" ? " is-pulse" : ""
              }${mark ? ` is-${mark}` : ""}`}
              style={{ "--pin": h.color }}
            >
              <i />
              <button type="button" onClick={() => onPickHotspot?.(h.id)} title={blank ? "Structure à nommer" : h.label}>
                {blank ? face : h.label}
              </button>
            </span>
          );
        })}
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
