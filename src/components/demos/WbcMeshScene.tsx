import { useEffect, useRef, useState } from "react";

export interface ReachFrame {
  time: number;
  com: number[];
  hand: number[];
  hand_target: number[];
  foot_force_world: number[][];
  foot_positions_world: number[][];
  joint_poses: number[][];
}
interface Visual {
  parent: number;
  mesh: string;
  placement: number[];
  scale: number[];
  color: number[];
}

export default function WbcMeshScene({ frame, goal, baseTarget }: { frame: ReachFrame; goal: number[]; baseTarget?: number[] }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ frame, goal, baseTarget });
  const update = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState("Loading Talos meshes…");
  latest.current = { frame, goal, baseTarget };
  useEffect(() => {
    update.current?.();
  }, [frame, goal, baseTarget]);
  useEffect(() => {
    const container = host.current!;
    let cancelled = false;
    let cleanup = () => {};
    async function mount() {
      const [T, { STLLoader }, { OrbitControls }] = await Promise.all([
        import("three"),
        import("three/addons/loaders/STLLoader.js"),
        import("three/addons/controls/OrbitControls.js"),
      ]);
      if (cancelled) return;
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0xffffff, 1);
      renderer.domElement.setAttribute("aria-label", baseTarget ? "Talos mesh model with pelvis pose target, center of mass, and contact forces" : "Talos mesh model with hand target, center of mass, and contact forces");
      renderer.domElement.setAttribute("role", "img");
      container.appendChild(renderer.domElement);
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(35, 1, 0.01, 30);
      camera.up.set(0, 0, 1);
      camera.position.set(2.7, -3.2, 1.8);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0.2, 0, 0.9);
      controls.minDistance = 1.5;
      controls.maxDistance = 6;
      controls.maxPolarAngle = Math.PI / 2 - 0.03;
      controls.update();
      scene.add(new T.HemisphereLight(0xffffff, 0x63726c, 2.4));
      const light = new T.DirectionalLight(0xffffff, 2.5);
      light.position.set(2, -3, 5);
      scene.add(light);
      const plane = new T.Mesh(new T.PlaneGeometry(2.4, 1.5), new T.MeshStandardMaterial({ color: 0xf1f5f3, roughness: 1 }));
      plane.position.z = -0.006;
      scene.add(plane);
      const grid = new T.GridHelper(2.4, 12, 0xc5d3cb, 0xdde6e0);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = -0.004;
      scene.add(grid);
      const marker = (color: number, radius: number, wireframe = false) => {
        const object = new T.Mesh(new T.SphereGeometry(radius, 20, 14), new T.MeshBasicMaterial({ color, wireframe, depthTest: false }));
        object.renderOrder = 2;
        scene.add(object);
        return object;
      };
      const com = marker(0x347361, 0.022);
      const hand = marker(0x347361, 0.016);
      const target = baseTarget
        ? new T.Mesh(new T.BoxGeometry(0.22, 0.16, 0.12), new T.MeshBasicMaterial({ color: 0xb34a33, wireframe: true, depthTest: false }))
        : marker(0xb34a33, 0.035, true);
      if (baseTarget) {
        target.renderOrder = 2;
        scene.add(target);
      }
      const baseAxes = new T.AxesHelper(0.18);
      if (baseTarget) scene.add(baseAxes);
      const goalMarker = marker(0xb34a33, 0.012);
      const errorGeometry = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
      const errorLine = new T.Line(errorGeometry, new T.LineBasicMaterial({ color: 0xb34a33, depthTest: false }));
      errorLine.renderOrder = 3;
      scene.add(errorLine);
      const arrows = [0, 1].map(() => {
        const arrow = new T.ArrowHelper(new T.Vector3(0, 0, 1), new T.Vector3(), 0.4, 0xb86024, 0.05, 0.025);
        for (const object of [arrow.line, arrow.cone]) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            material.depthTest = false;
          });
        }
        arrow.line.renderOrder = 4;
        arrow.cone.renderOrder = 4;
        scene.add(arrow);
        return arrow;
      });
      const meshes: { object: InstanceType<typeof T.Mesh>; parent: number; local: InstanceType<typeof T.Matrix4> }[] = [];
      const loader = new STLLoader();
      const geometries = new Map<string, ReturnType<typeof loader.loadAsync>>();
      const render = () => renderer.render(scene, camera);
      const resize = new ResizeObserver(() => {
        renderer.setSize(container.clientWidth, container.clientHeight);
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        render();
      });
      resize.observe(container);
      controls.addEventListener("change", render);
      const poseMatrix = (pose: number[]) =>
        new T.Matrix4().compose(
          new T.Vector3(...(pose.slice(0, 3) as [number, number, number])),
          new T.Quaternion(...(pose.slice(3, 7) as [number, number, number, number])),
          new T.Vector3(1, 1, 1)
        );
      update.current = () => {
        const { frame: f, goal: g, baseTarget: basePose } = latest.current;
        for (const mesh of meshes) {
          mesh.object.matrix.copy(poseMatrix(f.joint_poses[mesh.parent])).multiply(mesh.local);
          mesh.object.matrixWorldNeedsUpdate = true;
        }
        com.position.fromArray(f.com);
        hand.position.fromArray(f.hand);
        hand.visible = !basePose;
        goalMarker.visible = !basePose;
        errorLine.visible = !basePose;
        if (basePose) {
          target.position.fromArray(basePose.slice(0, 3));
          target.quaternion.fromArray(basePose.slice(3, 7));
          baseAxes.position.copy(target.position);
          baseAxes.quaternion.copy(target.quaternion);
        } else target.position.fromArray(f.hand_target);
        goalMarker.position.fromArray(g);
        errorGeometry.setFromPoints([new T.Vector3().fromArray(f.hand), new T.Vector3().fromArray(f.hand_target)]);
        arrows.forEach((arrow, i) => {
          const force = new T.Vector3().fromArray(f.foot_force_world[i]);
          arrow.position.fromArray(f.foot_positions_world[i]);
          arrow.setDirection(force.clone().normalize());
          arrow.setLength(force.length() * 0.001, 0.05, 0.025);
        });
        render();
      };
      cleanup = () => {
        resize.disconnect();
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        update.current = null;
        scene.traverse((object) => {
          if (object instanceof T.Mesh || object instanceof T.Line) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
      };
      const response = await fetch("/assets/models/talos/visuals.json");
      if (!response.ok) throw new Error("Talos manifest unavailable");
      const visuals: Visual[] = await response.json();
      await Promise.all(
        visuals.map(async (visual) => {
          if (!geometries.has(visual.mesh)) geometries.set(visual.mesh, loader.loadAsync(visual.mesh));
          const geometry = await geometries.get(visual.mesh)!;
          if (cancelled) return;
          const object = new T.Mesh(
            geometry,
            new T.MeshStandardMaterial({
              color: new T.Color().fromArray(visual.color),
              metalness: 0.15,
              roughness: 0.65,
            })
          );
          object.matrixAutoUpdate = false;
          const local = poseMatrix(visual.placement).scale(new T.Vector3().fromArray(visual.scale));
          meshes.push({ object, parent: visual.parent, local });
          scene.add(object);
        })
      );
      if (cancelled) return;
      update.current?.();
      setStatus("");
    }
    mount().catch(() => {
      if (!cancelled) setStatus("3D view unavailable. The computed results remain available below.");
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);
  return (
    <div className="wbc-mesh-scene">
      <div className="wbc-mesh-canvas" ref={host} />
      {status && (
        <p className="wbc-mesh-status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
