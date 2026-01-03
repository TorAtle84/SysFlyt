"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Home,
  Eye,
  Ghost,
  Search,
  Share2,
  Users,
  Copy,
  LogOut,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Vec3 = { x: number; y: number; z: number };
type BoundingBox = { min: Vec3; max: Vec3 };

type ModelInfo = {
  id: string;
  name: string;
  fileName?: string | null;
  status: "UPLOADING" | "CONVERTING" | "READY" | "ERROR";
  errorMessage?: string | null;
  progressPercent?: number | null;
  progressStage?: string | null;
};

export type BimModelComponent = {
  id: string;
  modelId: string;
  systemCode?: string | null;
  componentTag?: string | null;
  fullTag?: string | null;
  ifcGuid?: string | null;
  ifcType?: string | null;
  name?: string | null;
  floor?: string | null;
  position?: Vec3 | null;
  boundingBox?: BoundingBox | null;
};

function hashToColor(input: string): THREE.Color {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const color = new THREE.Color();
  color.setHSL(hue / 360, 0.42, 0.52);
  return color;
}

function fitCameraToBox(params: {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  box: THREE.Box3;
  padding?: number;
}) {
  const { camera, controls, box, padding = 1.6 } = params;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  let cameraZ = Math.abs((maxDim / 2) / Math.tan(fov / 2));
  cameraZ *= padding;

  const direction = new THREE.Vector3(1, 1, 1).normalize();
  const newPos = center.clone().add(direction.multiplyScalar(cameraZ));
  camera.position.copy(newPos);
  controls.target.copy(center);
  controls.update();
}

interface ModelViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  modelId: string | null;
  initialFullTag?: string;
  sessionId?: string;
}

export function ModelViewerModal({
  open,
  onOpenChange,
  projectId,
  modelId,
  initialFullTag,
  sessionId,
}: ModelViewerModalProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());

  const groupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const meshesByTagRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const highlightMeshRef = useRef<THREE.Mesh | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const initialJumpHandledRef = useRef<string | null>(null);

  const { data: session } = useSession();
  const userId = session?.user?.id || null;

  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId || null);
  const [sessionRole, setSessionRole] = useState<"host" | "participant" | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any | null>(null);

  const sessionPollIntervalRef = useRef<number | null>(null);
  const sessionUpdateTimerRef = useRef<number | null>(null);

  const activeSessionIdRef = useRef<string | null>(null);
  const sessionRoleRef = useRef<"host" | "participant" | null>(null);
  const selectedFullTagRef = useRef<string | null>(null);
  const focusedSystemRef = useRef<string | null>(null);
  const ghostModeRef = useRef<boolean>(false);
  const systemSelectionRef = useRef<Record<string, boolean>>({});
  const floorSelectionRef = useRef<Record<string, boolean>>({});

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [components, setComponents] = useState<BimModelComponent[]>([]);
  const [loading, setLoading] = useState(false);
  const [jumpingToProtocol, setJumpingToProtocol] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, []);

  const [ghostMode, setGhostMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [focusedSystem, setFocusedSystem] = useState<string | null>(null);
  const [systemSelection, setSystemSelection] = useState<Record<string, boolean>>({});
  const [floorSelection, setFloorSelection] = useState<Record<string, boolean>>({});

  const floors = useMemo(() => {
    const uniq = new Set<string>();
    for (const c of components) {
      if (c.floor) uniq.add(c.floor);
    }
    return Array.from(uniq).sort((a, b) => a.localeCompare(b));
  }, [components]);

  const systems = useMemo(() => {
    const uniq = new Set<string>();
    for (const c of components) {
      if (c.systemCode) uniq.add(c.systemCode);
    }
    return Array.from(uniq).sort((a, b) => a.localeCompare(b));
  }, [components]);

  const selectedComponent = useMemo(() => {
    if (!selectedTag) return null;
    return components.find((c) => c.fullTag === selectedTag) || null;
  }, [components, selectedTag]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    sessionRoleRef.current = sessionRole;
  }, [activeSessionId, sessionRole]);

  useEffect(() => {
    selectedFullTagRef.current = selectedTag;
  }, [selectedTag]);

  useEffect(() => {
    focusedSystemRef.current = focusedSystem;
  }, [focusedSystem]);

  useEffect(() => {
    ghostModeRef.current = ghostMode;
  }, [ghostMode]);

  useEffect(() => {
    systemSelectionRef.current = systemSelection;
  }, [systemSelection]);

  useEffect(() => {
    floorSelectionRef.current = floorSelection;
  }, [floorSelection]);

  useEffect(() => {
    if (!open) {
      if (sessionPollIntervalRef.current) {
        window.clearInterval(sessionPollIntervalRef.current);
        sessionPollIntervalRef.current = null;
      }
      if (sessionUpdateTimerRef.current) {
        window.clearTimeout(sessionUpdateTimerRef.current);
        sessionUpdateTimerRef.current = null;
      }
      setIsFullscreen(false);
      setSidebarCollapsed(false);
      setGhostMode(false);
      setSearchQuery("");
      setSelectedTag(null);
      setFocusedSystem(null);
      setSystemSelection({});
      setFloorSelection({});
      setModel(null);
      setComponents([]);
      setActiveSessionId(null);
      setSessionRole(null);
      setSessionInfo(null);
      initialJumpHandledRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (sessionId) {
      setActiveSessionId(sessionId);
    }
  }, [open, sessionId]);

  useEffect(() => {
    async function load() {
      if (!open || !modelId) return;
      setLoading(true);
      try {
        const modelRes = await fetch(`/api/projects/${projectId}/models/${modelId}`, { cache: "no-store" });
        if (!modelRes.ok) {
          const data = await modelRes.json().catch(() => null);
          throw new Error(data?.error || "Kunne ikke hente modell");
        }
        const modelJson = await modelRes.json();

        const progress = modelJson?.metadata?.progress;
        const progressPercent =
          typeof progress === "number" ? progress : typeof progress?.percent === "number" ? progress.percent : null;
        const progressStage = typeof progress?.stage === "string" ? progress.stage : null;

        setModel({
          id: modelJson.id,
          name: modelJson.name,
          fileName: modelJson.fileName ?? null,
          status: modelJson.status,
          errorMessage: modelJson.errorMessage,
          progressPercent,
          progressStage,
        });

        if (modelJson.status !== "READY") {
          setComponents([]);
          return;
        }

        const res = await fetch(`/api/projects/${projectId}/models/${modelId}/components?limit=5000`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Kunne ikke hente komponenter");
        }
        const comps = (await res.json()) as BimModelComponent[];
        setComponents(comps.filter((c) => c.fullTag && c.position));
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Kunne ikke laste modell");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [open, projectId, modelId]);

  useEffect(() => {
    if (!open || !modelId) return;
    if (!model) return;
    if (model.status !== "UPLOADING" && model.status !== "CONVERTING") return;

    let cancelled = false;

    const poll = async () => {
      try {
        const modelRes = await fetch(`/api/projects/${projectId}/models/${modelId}`, { cache: "no-store" });
        if (!modelRes.ok) return;
        const modelJson = await modelRes.json();
        if (cancelled) return;

        const progress = modelJson?.metadata?.progress;
        const progressPercent =
          typeof progress === "number" ? progress : typeof progress?.percent === "number" ? progress.percent : null;
        const progressStage = typeof progress?.stage === "string" ? progress.stage : null;

        setModel({
          id: modelJson.id,
          name: modelJson.name,
          fileName: modelJson.fileName ?? null,
          status: modelJson.status,
          errorMessage: modelJson.errorMessage,
          progressPercent,
          progressStage,
        });

        if (modelJson.status === "READY") {
          const res = await fetch(`/api/projects/${projectId}/models/${modelId}/components?limit=5000`, {
            cache: "no-store",
          });
          if (!res.ok) return;
          const comps = (await res.json()) as BimModelComponent[];
          if (cancelled) return;
          setComponents(comps.filter((c) => c.fullTag && c.position));
        }
      } catch {
        // ignore polling errors
      }
    };

    void poll();

    const interval = window.setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [model?.status, modelId, open, projectId]);

  useEffect(() => {
    if (!open) return;
    if (systems.length === 0) return;

    setSystemSelection((prev) => {
      // Keep existing toggles if possible
      const next: Record<string, boolean> = {};
      for (const s of systems) next[s] = prev[s] ?? true;
      return next;
    });
  }, [open, systems]);

  useEffect(() => {
    if (!open) return;
    if (floors.length === 0) return;

    setFloorSelection((prev) => {
      const next: Record<string, boolean> = {};
      for (const f of floors) next[f] = prev[f] ?? true;
      return next;
    });
  }, [open, floors]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.enabled = sessionRole !== "participant";
  }, [sessionRole]);

  useEffect(() => {
    if (!open || !modelId || !activeSessionId || !userId) return;
    if (sessionRole) return;
    void joinExistingSession(activeSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modelId, activeSessionId, userId, sessionRole]);

  useEffect(() => {
    if (!open || !modelId || !activeSessionId || !userId || !sessionRole) return;

    const pollMs = sessionRole === "participant" ? 800 : 2500;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/models/${modelId}/sessions/${activeSessionId}`,
          { cache: "no-store" }
        );

        if (!res.ok) {
          if (sessionRole === "participant") {
            setActiveSessionId(null);
            setSessionRole(null);
            setSessionInfo(null);
            toast.info("Sesjonen er avsluttet");
          }
          return;
        }

        const data = await res.json();
        setSessionInfo(data);

        if (sessionRole === "participant") {
          applyRemoteSessionState(data);
        }
      } catch {
        // ignore polling errors
      }
    };

    void poll();
    const interval = window.setInterval(poll, pollMs);
    sessionPollIntervalRef.current = interval;

    return () => {
      window.clearInterval(interval);
      sessionPollIntervalRef.current = null;
    };
  }, [open, modelId, activeSessionId, userId, sessionRole, projectId]);

  useEffect(() => {
    if (!open || !modelId) return;

    return () => {
      const id = activeSessionIdRef.current;
      if (!id) return;
      void leaveSession(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modelId, projectId]);

  useEffect(() => {
    if (!open) return;
    if (sessionRole !== "host" || !activeSessionId) return;
    scheduleHostSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionRole, activeSessionId, selectedTag, focusedSystem, ghostMode, systemSelection, floorSelection]);

  // Three.js init + render loop
  useEffect(() => {
    if (!open) return;
    if (!modelId) return;
    if (!containerRef.current || !canvasRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1220");

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 10000);
    camera.position.set(18, 18, 18);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = false;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.enablePan = true;

    const handleControlsChange = () => {
      if (sessionRoleRef.current !== "host") return;
      scheduleHostSync();
    };
    controls.addEventListener("change", handleControlsChange);

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(20, 40, 15);
    scene.add(dir);

    const grid = new THREE.GridHelper(200, 50, 0x2b3446, 0x1b2230);
    grid.position.y = -0.6;
    scene.add(grid);

    // Highlight overlay
    const highlightGeo = new THREE.BoxGeometry(1.25, 1.25, 1.25);
    const highlightMat = new THREE.MeshBasicMaterial({ color: "#facc15", wireframe: true, transparent: true, opacity: 1 });
    const highlightMesh = new THREE.Mesh(highlightGeo, highlightMat);
    highlightMesh.visible = false;
    scene.add(highlightMesh);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    highlightMeshRef.current = highlightMesh;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    resize();

    resizeObserverRef.current = new ResizeObserver(() => resize());
    resizeObserverRef.current.observe(container);

    const tick = () => {
      controls.update();

      // Subtle pulse for highlight
      if (highlightMesh.visible) {
        const t = Date.now() * 0.004;
        (highlightMat as THREE.MeshBasicMaterial).opacity = 0.55 + (Math.sin(t) + 1) * 0.2;
      }

      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;

      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;

      controls.removeEventListener("change", handleControlsChange);
      controls.dispose();
      highlightGeo.dispose();
      highlightMat.dispose();
      renderer.dispose();

      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      highlightMeshRef.current = null;

      groupsRef.current.clear();
      meshesByTagRef.current.clear();
    };
  }, [open, modelId]);

  // Build/rebuild scene content from components
  useEffect(() => {
    if (!open) return;
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old groups
    for (const group of groupsRef.current.values()) {
      scene.remove(group);
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material && Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else if (mesh.material) {
          (mesh.material as THREE.Material).dispose();
        }
      });
    }
    groupsRef.current.clear();
    meshesByTagRef.current.clear();

    if (components.length === 0) return;

    const geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);

    for (const component of components) {
      if (!component.fullTag || !component.position) continue;
      const systemCode = component.systemCode || "Ukjent";

      let group = groupsRef.current.get(systemCode);
      if (!group) {
        group = new THREE.Group();
        group.name = `system:${systemCode}`;
        group.userData.systemCode = systemCode;
        groupsRef.current.set(systemCode, group);
        scene.add(group);
      }

      const baseColor = hashToColor(systemCode);
      const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.55,
        metalness: 0.08,
        transparent: true,
        opacity: 1,
      });

      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(component.position.x, component.position.y, component.position.z);
      mesh.userData.fullTag = component.fullTag;
      mesh.userData.systemCode = systemCode;
      mesh.userData.floor = component.floor ?? null;
      mesh.userData.component = component;
      group.add(mesh);
      meshesByTagRef.current.set(component.fullTag, mesh);
    }

    // Frame camera to all content
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      const box = new THREE.Box3();
      for (const mesh of meshesByTagRef.current.values()) {
        box.expandByObject(mesh);
      }
      if (!box.isEmpty()) {
        fitCameraToBox({ camera, controls, box, padding: 2.1 });
      }
    }

    // Apply initial selection if provided
    if (initialFullTag && initialJumpHandledRef.current !== initialFullTag) {
      initialJumpHandledRef.current = initialFullTag;
      const mesh = meshesByTagRef.current.get(initialFullTag);
      if (mesh) {
        jumpToTag(initialFullTag);
        setGhostMode(true);
      } else {
        toast.info("Komponent ikke funnet i modellen");
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, components]);

  useEffect(() => {
    if (!open) return;
    const highlight = highlightMeshRef.current;
    if (!highlight) return;

    if (!selectedTag) {
      highlight.visible = false;
      return;
    }

    const mesh = meshesByTagRef.current.get(selectedTag);
    if (!mesh) return;

    highlight.visible = true;
    highlight.position.copy(mesh.position);
  }, [open, selectedTag, components]);

  // Apply system visibility + ghosting whenever filters or ghost mode changes
  useEffect(() => {
    if (!open) return;
    for (const [system, group] of groupsRef.current.entries()) {
      const visible = systemSelection[system] ?? true;
      group.visible = visible;

      group.traverse((obj) => {
        if (!(obj as any).isMesh) return;
        const mesh = obj as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat) return;

        const floor = mesh.userData.floor as string | null | undefined;
        mesh.visible = floor ? (floorSelection[floor] ?? true) : true;

        const isFocused = focusedSystem ? system === focusedSystem : true;
        const shouldGhost = ghostMode && focusedSystem && !isFocused;

        mat.opacity = shouldGhost ? 0.2 : 1;
        mat.color = shouldGhost ? new THREE.Color("#556070") : hashToColor(system);
        mat.needsUpdate = true;
      });
    }
  }, [open, systemSelection, floorSelection, ghostMode, focusedSystem]);

  function selectByMesh(mesh: THREE.Mesh) {
    const tag = mesh.userData.fullTag as string | undefined;
    const systemCode = mesh.userData.systemCode as string | undefined;
    if (!tag) return;

    setSelectedTag(tag);
    if (systemCode) setFocusedSystem(systemCode);

    const highlight = highlightMeshRef.current;
    if (highlight) {
      highlight.visible = true;
      highlight.position.copy(mesh.position);
    }
  }

  function handleCanvasPointerDown(event: React.PointerEvent) {
    if (!open) return;
    if (sessionRole === "participant") return;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!camera || !scene) return;

    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

    pointerRef.current.set(x, y);
    raycasterRef.current.setFromCamera(pointerRef.current, camera);

    const intersections = raycasterRef.current.intersectObjects(Array.from(meshesByTagRef.current.values()), false);
    if (intersections.length === 0) return;

    const hit = intersections[0].object as THREE.Mesh;
    const systemCode = hit.userData.systemCode as string | undefined;

    if (ghostMode && focusedSystem && systemCode && systemCode !== focusedSystem) {
      return; // no interaction on ghosted elements
    }

    selectByMesh(hit);
  }

  function handleCanvasDoubleClick(event: React.MouseEvent) {
    if (!open) return;
    if (sessionRole === "participant") return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

    pointerRef.current.set(x, y);
    raycasterRef.current.setFromCamera(pointerRef.current, camera);
    const intersections = raycasterRef.current.intersectObjects(Array.from(meshesByTagRef.current.values()), false);
    if (intersections.length === 0) return;

    const hit = intersections[0].object as THREE.Mesh;
    const box = new THREE.Box3().setFromObject(hit);
    fitCameraToBox({ camera, controls, box, padding: 3.0 });
  }

  function resetCamera() {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.set(18, 18, 18);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function showAll() {
    setGhostMode(false);
    setFocusedSystem(null);
    setSystemSelection((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const s of systems) next[s] = true;
      return next;
    });
    setFloorSelection((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const f of floors) next[f] = true;
      return next;
    });
  }

  function getCameraPositionPayload() {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return null;
    return {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      targetX: controls.target.x,
      targetY: controls.target.y,
      targetZ: controls.target.z,
    };
  }

  function getStatePayload() {
    return {
      selectedFullTag: selectedFullTagRef.current,
      focusedSystem: focusedSystemRef.current,
      ghostMode: ghostModeRef.current,
      systemSelection: systemSelectionRef.current,
      floorSelection: floorSelectionRef.current,
    };
  }

  async function pushSessionUpdate(sessionIdToUpdate: string) {
    if (!modelId) return;
    const cameraPosition = getCameraPositionPayload();
    const state = getStatePayload();
    const selectedFullTag = state.selectedFullTag;
    const selectedComponentId =
      selectedFullTag ? components.find((c) => c.fullTag === selectedFullTag)?.id ?? null : null;

    try {
      await fetch(
        `/api/projects/${projectId}/models/${modelId}/sessions/${sessionIdToUpdate}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cameraPosition,
            state,
            selectedComponentId,
          }),
        }
      );
    } catch {
      // ignore update errors
    }
  }

  function scheduleHostSync() {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    if (sessionRoleRef.current !== "host") return;
    if (sessionUpdateTimerRef.current) return;

    sessionUpdateTimerRef.current = window.setTimeout(() => {
      sessionUpdateTimerRef.current = null;
      void pushSessionUpdate(sid);
    }, 200);
  }

  function applyRemoteSessionState(remote: any) {
    const cameraPosition = remote?.cameraPosition;
    const state = remote?.state;

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (cameraPosition && camera && controls) {
      const { x, y, z, targetX, targetY, targetZ } = cameraPosition;
      if (
        [x, y, z, targetX, targetY, targetZ].every((v) => typeof v === "number" && Number.isFinite(v))
      ) {
        camera.position.set(x, y, z);
        controls.target.set(targetX, targetY, targetZ);
        controls.update();
      }
    }

    if (state && typeof state === "object") {
      if (typeof state.ghostMode === "boolean") setGhostMode(state.ghostMode);
      if (typeof state.focusedSystem === "string" || state.focusedSystem === null) setFocusedSystem(state.focusedSystem);
      if (state.systemSelection && typeof state.systemSelection === "object") setSystemSelection(state.systemSelection);
      if (state.floorSelection && typeof state.floorSelection === "object") setFloorSelection(state.floorSelection);
      if (typeof state.selectedFullTag === "string" || state.selectedFullTag === null) setSelectedTag(state.selectedFullTag);
    }
  }

  async function joinExistingSession(sessionIdToJoin: string) {
    if (!modelId || !userId) return;

    try {
      const joinRes = await fetch(
        `/api/projects/${projectId}/models/${modelId}/sessions/${sessionIdToJoin}/join`,
        { method: "POST" }
      );

      if (!joinRes.ok) {
        const data = await joinRes.json().catch(() => null);
        throw new Error(data?.error || "Kunne ikke bli med i sesjonen");
      }

      const res = await fetch(
        `/api/projects/${projectId}/models/${modelId}/sessions/${sessionIdToJoin}`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Sesjon ikke funnet");
      }

      const data = await res.json();
      setSessionInfo(data);
      const role: "host" | "participant" = data.hostUserId === userId ? "host" : "participant";
      setSessionRole(role);

      if (role === "participant") {
        toast.info("Du følger vertens visning");
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Kunne ikke bli med i sesjonen");
      setActiveSessionId(null);
      setSessionRole(null);
      setSessionInfo(null);
    }
  }

  async function leaveSession(sessionIdToLeave: string) {
    if (!modelId || !userId) return;
    try {
      await fetch(
        `/api/projects/${projectId}/models/${modelId}/sessions/${sessionIdToLeave}/leave`,
        { method: "POST" }
      );
    } catch {
      // ignore
    }
  }

  async function startSharing() {
    if (!modelId || !userId) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/models/${modelId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cameraPosition: getCameraPositionPayload(),
          state: getStatePayload(),
          selectedComponentId: selectedComponent?.id ?? null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Kunne ikke starte delt visning");
      }

      const created = await res.json();
      setActiveSessionId(created.id);
      setSessionRole("host");
      setSessionInfo(created);
      toast.success("Delt visning aktiv");

      await copyShareLink(created.id);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Kunne ikke starte delt visning");
    }
  }

  async function copyShareLink(overrideSessionId?: string) {
    if (!modelId) return;
    const sid = overrideSessionId || activeSessionId;
    if (!sid) return;

    const base = typeof window !== "undefined" ? window.location.origin : "";
    const tag = selectedTag ? `&tag=${encodeURIComponent(selectedTag)}` : "";
    const link = `${base}/projects/${encodeURIComponent(projectId)}/models?model=${encodeURIComponent(modelId)}&session=${encodeURIComponent(sid)}${tag}`;

    try {
      await navigator.clipboard.writeText(link);
      toast.success("Lenke kopiert");
    } catch {
      toast.info(link);
    }
  }

  async function stopSharing() {
    const sid = activeSessionId;
    if (!sid) return;
    await leaveSession(sid);
    if (sessionUpdateTimerRef.current) {
      window.clearTimeout(sessionUpdateTimerRef.current);
      sessionUpdateTimerRef.current = null;
    }
    setActiveSessionId(null);
    setSessionRole(null);
    setSessionInfo(null);
  }

  async function handleGoToProtocol() {
    if (!selectedComponent?.fullTag) return;
    if (jumpingToProtocol) return;

    setJumpingToProtocol(true);
    try {
      const url = new URL(`/api/projects/${projectId}/models/jump-to-protocol`, window.location.origin);
      url.searchParams.set("fullTag", selectedComponent.fullTag);

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Kunne ikke finne protokollpunkt");
      }

      const data = (await res.json()) as { protocolId: string; itemId: string };
      onOpenChange(false);
      router.push(`/syslink/projects/${projectId}/protocols/${data.protocolId}?item=${encodeURIComponent(data.itemId)}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Kunne ikke åpne protokoll");
    } finally {
      setJumpingToProtocol(false);
    }
  }

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return components
      .filter((c) => (c.fullTag || "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [components, searchQuery]);

  function jumpToTag(fullTag: string) {
    const mesh = meshesByTagRef.current.get(fullTag);
    if (!mesh) return;
    selectByMesh(mesh);

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const box = new THREE.Box3().setFromObject(mesh);
    fitCameraToBox({ camera, controls, box, padding: 3.0 });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "p-0 gap-0 overflow-hidden",
          isFullscreen ? "w-[100vw] h-[100vh] max-w-none max-h-none rounded-none" : "w-[90vw] h-[90vh] max-w-none max-h-none"
        )}
      >
        <DialogHeader className="px-4 pt-3 pb-4 border-b border-border">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="truncate">{model?.fileName || model?.name || "3D Modell"}</DialogTitle>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 border border-border bg-card/40"
                onClick={() => setSidebarCollapsed((v) => !v)}
                aria-label={sidebarCollapsed ? "Vis sidepanel" : "Skjul sidepanel"}
                title={sidebarCollapsed ? "Vis sidepanel" : "Skjul sidepanel"}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 border border-border bg-card/40"
                onClick={() => setIsFullscreen((v) => !v)}
                aria-label={isFullscreen ? "Normal størrelse" : "Fullskjerm"}
                title={isFullscreen ? "Normal størrelse" : "Fullskjerm"}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 border border-border bg-card/40 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onOpenChange(false)}
                aria-label="Lukk"
                title="Lukk"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="text-sm text-muted-foreground mt-1">
            {loading ? "Laster..." : model?.status === "READY" ? `${components.length} komponenter` : null}
            {model?.status === "CONVERTING"
              ? `Konverterer...${model.progressPercent != null ? ` ${model.progressPercent}%` : ""}${model.progressStage ? ` • ${model.progressStage}` : ""
              }`
              : null}
            {model?.status === "UPLOADING" ? "Laster opp..." : null}
            {model?.status === "ERROR" ? `Feil: ${model.errorMessage || "Ukjent feil"}` : null}
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={resetCamera}
                disabled={sessionRole === "participant"}
                aria-label="Hjem"
                title="Hjem"
              >
                <Home className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={showAll}
                disabled={sessionRole === "participant"}
                aria-label="Vis alt"
                title="Vis alt"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant={ghostMode ? "default" : "outline"}
                size="icon"
                onClick={() => setGhostMode((v) => !v)}
                disabled={!focusedSystem || sessionRole === "participant"}
                aria-label="Ghost modus"
                title={!focusedSystem ? "Velg en komponent for å aktivere system-fokus" : "Ghost modus"}
              >
                <Ghost className="h-4 w-4" />
              </Button>
            </div>

            <div className="relative flex-1 lg:max-w-[420px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Søk komponent..."
                className="pl-9"
                disabled={sessionRole === "participant" || model?.status !== "READY"}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const first = searchResults[0]?.fullTag;
                  if (!first) return;
                  jumpToTag(first);
                  setSearchQuery("");
                }}
              />
              {searchQuery.trim().length > 0 && searchResults.length > 0 ? (
                <div className="absolute z-10 mt-2 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                  {searchResults.map((r) => (
                    <button
                      key={r.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        if (r.fullTag) jumpToTag(r.fullTag);
                        setSearchQuery("");
                      }}
                    >
                      <div className="font-medium">{r.fullTag}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.ifcType || "Ukjent type"}
                        {r.ifcGuid ? ` • ${r.ifcGuid}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {activeSessionId ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => copyShareLink()}>
                    <Copy className="h-4 w-4 mr-1" />
                    Kopier lenke
                  </Button>
                  <Button variant="outline" size="sm" onClick={stopSharing}>
                    <LogOut className="h-4 w-4 mr-1" />
                    {sessionRole === "host" ? "Stopp deling" : "Forlat"}
                  </Button>
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {Array.isArray(sessionInfo?.participants) ? sessionInfo.participants.length : 1}
                  </div>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startSharing}
                  disabled={loading || model?.status !== "READY" || !userId}
                >
                  <Share2 className="h-4 w-4 mr-1" />
                  Del visning
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex h-full min-h-0">
          <div className="flex-1 min-w-0">
            <div className="h-full bg-gradient-to-br from-slate-950 to-slate-900">
              <div ref={containerRef} className="relative h-full w-full">
                <canvas
                  ref={canvasRef}
                  className="h-full w-full block"
                  onPointerDown={handleCanvasPointerDown}
                  onDoubleClick={handleCanvasDoubleClick}
                />

                {loading && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="flex items-center gap-2 rounded-lg bg-black/40 px-3 py-2 text-sm text-white">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Laster modell...
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {!sidebarCollapsed ? (
            <aside className="hidden lg:block w-[320px] border-l border-border bg-card">
              <div className="p-5 space-y-5">
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Etasjer</div>
                  <div className="space-y-2 max-h-[200px] overflow-auto pr-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={
                          floors.length === 0
                            ? true
                            : floors.every((f) => floorSelection[f] ?? true)
                              ? true
                              : floors.some((f) => floorSelection[f] ?? true)
                                ? "indeterminate"
                                : false
                        }
                        disabled={sessionRole === "participant" || floors.length === 0}
                        onCheckedChange={(checked) => {
                          const nextValue = checked === true;
                          setFloorSelection(() => {
                            const next: Record<string, boolean> = {};
                            for (const f of floors) next[f] = nextValue;
                            return next;
                          });
                        }}
                      />
                      <span className="truncate">Alle</span>
                    </label>

                    {floors.map((floor) => (
                      <label key={floor} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={floorSelection[floor] ?? true}
                          disabled={sessionRole === "participant"}
                          onCheckedChange={(checked) =>
                            setFloorSelection((prev) => ({ ...prev, [floor]: Boolean(checked) }))
                          }
                        />
                        <span className="truncate">{floor}</span>
                      </label>
                    ))}

                    {floors.length === 0 ? (
                      <div className="text-xs text-muted-foreground mt-2">
                        Etasjefilter kommer når IFC-metadata støtter nivåer.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-semibold">Systemer</div>
                  <div className="space-y-2 max-h-[240px] overflow-auto pr-2">
                    {systems.map((system) => (
                      <label key={system} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={systemSelection[system] ?? true}
                          disabled={sessionRole === "participant"}
                          onCheckedChange={(checked) =>
                            setSystemSelection((prev) => ({ ...prev, [system]: Boolean(checked) }))
                          }
                        />
                        <span className="truncate">{system}</span>
                      </label>
                    ))}
                    {systems.length === 0 && (
                      <div className="text-xs text-muted-foreground">Ingen systemer funnet</div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-semibold">Valgt komponent</div>
                  {selectedComponent ? (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">Tag</div>
                          <div className="text-xs font-medium truncate">{selectedComponent.componentTag || "Ukjent"}</div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">System</div>
                          <div className="text-xs font-medium truncate">{selectedComponent.systemCode || "Ukjent"}</div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">Type</div>
                          <div className="text-xs font-medium truncate">{selectedComponent.ifcType || "Ukjent"}</div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">Etasje</div>
                          <div className="text-xs font-medium truncate">{selectedComponent.floor || "—"}</div>
                        </div>
                      </div>

                      {selectedComponent.name ? (
                        <div className="text-xs text-muted-foreground truncate">{selectedComponent.name}</div>
                      ) : null}

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleGoToProtocol}
                        disabled={!selectedComponent.fullTag || jumpingToProtocol}
                      >
                        {jumpingToProtocol ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                        Gå til protokoll
                      </Button>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Klikk på en komponent i modellen for detaljer.
                    </div>
                  )}
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
