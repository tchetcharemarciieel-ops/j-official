"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Minus, Plus, RotateCcw, RotateCw, Scan } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Group, Mesh } from "three";
import { GARAGE_BAYS, GARAGE_PARKING, GARAGE_SPOTS, LAYOUT_STYLE, ROOM } from "@/lib/workspace";
import type { StationKind } from "@/lib/spec";
import { ROLE_COLORS, SKIN } from "./kinds";
import { fmtNumber, stationBadge, type GarageAreaView, type GarageSceneProps, type SceneProps, type SceneStation, type VenueAreaView, type VenueSceneProps } from "./types";

/** Couche HTML des étiquettes (hors du canevas) et mode compact quand la vue est dézoomée. */
const LabelCtx = createContext<{ portal: React.RefObject<HTMLDivElement> | null; compact: boolean }>({ portal: null, compact: false });

/** Étiquette HTML attachée à un point 3D, rendue dans la couche des étiquettes. */
function Label({ position, z = 10, interactive = false, children }: { position: [number, number, number]; z?: number; interactive?: boolean; children: React.ReactNode }) {
  const { portal } = useContext(LabelCtx);
  return (
    <Html position={position} center zIndexRange={[z, 0]} portal={portal ?? undefined}>
      {/* La couche des étiquettes laisse passer les gestes vers la scène ; seuls les boutons les captent. */}
      <div className={interactive ? "pointer-events-auto" : "pointer-events-none"}>{children}</div>
    </Html>
  );
}

/** Suit le niveau de zoom pour simplifier les étiquettes quand la pièce est vue de loin. */
function ZoomWatcher({ onCompact }: { onCompact: (c: boolean) => void }) {
  const last = useRef<boolean | null>(null);
  useFrame(({ camera }) => {
    const c = (camera as unknown as { zoom: number }).zoom < 38;
    if (c !== last.current) {
      last.current = c;
      onCompact(c);
    }
  });
  return null;
}

/**
 * Bureau virtuel en 3D isométrique (caméra orthographique) : chaque poste et chaque personnage
 * ouvre le module correspondant. Commandes : glisser pour tourner, pincer/molette pour zoomer,
 * deux doigts ou clic droit pour déplacer ; boutons équivalents pour l'accessibilité.
 */
export default function Scene3D(props: SceneProps) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const labels = useRef<HTMLDivElement>(null!);
  const [compact, setCompact] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const zoomBy = (k: number) => {
    const c = controls.current;
    if (!c) return;
    const cam = c.object as { zoom: number; updateProjectionMatrix: () => void };
    cam.zoom = Math.min(160, Math.max(14, cam.zoom * k));
    cam.updateProjectionMatrix();
    c.update();
  };
  const rotateBy = (a: number) => {
    const c = controls.current;
    if (!c) return;
    c.setAzimuthalAngle(c.getAzimuthalAngle() + a);
    c.update();
  };
  const reset = () => {
    controls.current?.reset();
    setFitKey((k) => k + 1);
  };

  return (
    <div className="relative h-full w-full touch-none select-none">
      <Canvas orthographic dpr={[1, 1.75]} camera={{ position: [16, 15, 16], zoom: 40, near: -200, far: 400 }} gl={{ antialias: true, powerPreference: "low-power" }} aria-label="Bureau virtuel en 3D">
        <color attach="background" args={["#eef2f6"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[10, 18, 8]} intensity={1.15} />
        <hemisphereLight args={["#ffffff", "#cbd5e1", 0.35]} />
        <FitCamera fitKey={fitKey} />
        <ZoomWatcher onCompact={setCompact} />
        <LabelCtx.Provider value={{ portal: labels, compact }}>
          <Room {...props} />
        </LabelCtx.Provider>
        <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} minZoom={14} maxZoom={160} minPolarAngle={Math.PI / 7} maxPolarAngle={Math.PI / 2.6} target={[0, 0, 0]} />
      </Canvas>
      <div ref={labels} className="pointer-events-none absolute inset-0 overflow-hidden" />
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5" role="group" aria-label="Commandes de la vue 3D">
        <CtrlButton label="Zoomer" onClick={() => zoomBy(1.25)}><Plus className="h-4 w-4" aria-hidden /></CtrlButton>
        <CtrlButton label="Dézoomer" onClick={() => zoomBy(0.8)}><Minus className="h-4 w-4" aria-hidden /></CtrlButton>
        <CtrlButton label="Tourner à gauche" onClick={() => rotateBy(-Math.PI / 4)}><RotateCcw className="h-4 w-4" aria-hidden /></CtrlButton>
        <CtrlButton label="Tourner à droite" onClick={() => rotateBy(Math.PI / 4)}><RotateCw className="h-4 w-4" aria-hidden /></CtrlButton>
        <CtrlButton label="Recentrer la vue" onClick={reset}><Scan className="h-4 w-4" aria-hidden /></CtrlButton>
      </div>
    </div>
  );
}

function CtrlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white/95 text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
      {children}
    </button>
  );
}

/** Adapte le zoom à la taille de l'écran pour que toute la pièce soit visible. */
function FitCamera({ fitKey }: { fitKey: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const z = Math.min(size.width / 15.5, size.height / 12);
    (camera as unknown as { zoom: number }).zoom = Math.max(14, Math.min(90, z));
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, fitKey]);
  return null;
}

function Box({ size, position, color, onClick }: { size: [number, number, number]; position: [number, number, number]; color: string; onClick?: () => void }) {
  return (
    <mesh position={position} onClick={onClick}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

function Cyl({ r, h, position, color, r2 }: { r: number; h: number; position: [number, number, number]; color: string; r2?: number }) {
  return (
    <mesh position={position}>
      <cylinderGeometry args={[r2 ?? r, r, h, 20]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

function Room({ stations, layout, title, kpis, demo, freeSlots, onOpen, garage, venue }: SceneProps) {
  const style = LAYOUT_STYLE[layout];
  const w = ROOM.width;
  const d = ROOM.depth;
  return (
    <group>
      {/* Sol et murs */}
      <Box size={[w, 0.2, d]} position={[0, -0.1, 0]} color={style.floor} />
      <Box size={[w, 3.2, 0.2]} position={[0, 1.6, -d / 2 - 0.1]} color={style.wall} />
      <Box size={[0.2, 3.2, d]} position={[-w / 2 - 0.1, 1.6, 0]} color={style.wall} />
      {[-4.5, -2.2].map((x) => <Box key={x} size={[1.5, 1.6, 0.05]} position={[x, 1.8, -d / 2 + 0.02]} color="#1e293b" />)}
      {[-2.6, 0.2, 2.9].map((z) => <Box key={z} size={[0.05, 1.6, 1.4]} position={[-w / 2 + 0.02, 1.8, z]} color="#1e293b" />)}
      {/* Enseigne de l'entreprise */}
      {!venue && (
        <Label position={[-0.2, 2.75, -d / 2 + 0.05]} z={5}>
          <div className="whitespace-nowrap rounded-md px-3 py-1 text-sm font-bold text-white shadow" style={{ background: style.accent }}>{title}</div>
        </Label>
      )}
      {garage ? (
        <GarageFloor garage={garage} accent={style.accent} />
      ) : venue ? (
        <VenueFloor venue={venue} accent={style.accent} />
      ) : (
        <>
          <Plant position={[-w / 2 + 0.6, 0, -d / 2 + 0.6]} />
          <Plant position={[w / 2 - 0.6, 0, d / 2 - 0.6]} />
          <Plant position={[-w / 2 + 0.6, 0, d / 2 - 0.6]} />
          {freeSlots.map((s, i) => <Decor key={i} kind={style.decor[i % style.decor.length]!} position={[s.x, 0, s.z]} />)}
          {stations.map((s, i) => (s.kind === "stats_board" ? <StatsBoard key={s.id} station={s} kpis={kpis} demo={demo} onOpen={onOpen} /> : <StationNode key={s.id} station={s} index={i} accent={style.accent} onOpen={onOpen} />))}
        </>
      )}
    </group>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Cyl r={0.28} r2={0.34} h={0.5} position={[0, 0.25, 0]} color="#f8fafc" />
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.5, 16, 12]} />
        <meshStandardMaterial color="#2f7d32" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Decor({ kind, position }: { kind: string; position: [number, number, number] }) {
  if (kind === "dining_tables")
    return (
      <group position={position}>
        <Cyl r={0.55} h={0.06} position={[0, 0.75, 0]} color="#8b5a2b" />
        <Cyl r={0.08} h={0.72} position={[0, 0.36, 0]} color="#5b3a1a" />
        {[0, 1, 2, 3].map((k) => <Box key={k} size={[0.35, 0.45, 0.35]} position={[Math.cos((k * Math.PI) / 2) * 0.85, 0.22, Math.sin((k * Math.PI) / 2) * 0.85]} color="#a16207" />)}
      </group>
    );
  if (kind === "car") return <Car position={position} color="#94a3b8" />;
  if (kind === "shelves") return <Shelf position={position} />;
  if (kind === "sofa")
    return (
      <group position={position}>
        <Box size={[1.6, 0.4, 0.7]} position={[0, 0.25, 0]} color="#64748b" />
        <Box size={[1.6, 0.5, 0.2]} position={[0, 0.6, -0.3]} color="#64748b" />
      </group>
    );
  return <Plant position={position} />;
}

function Car({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <Box size={[1.7, 0.45, 0.85]} position={[0, 0.4, 0]} color={color} />
      <Box size={[0.95, 0.35, 0.75]} position={[-0.1, 0.8, 0]} color="#cbd5e1" />
      {[[-0.55, 0.42], [0.55, 0.42], [-0.55, -0.42], [0.55, -0.42]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x!, 0.18, z!]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.12, 16]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
    </group>
  );
}

function Shelf({ position }: { position: [number, number, number] }) {
  const colors = ["#2563eb", "#f59e0b", "#16a34a", "#dc2626", "#7c3aed"];
  return (
    <group position={position}>
      <Box size={[1.7, 1.7, 0.08]} position={[0, 0.85, -0.25]} color="#e2e8f0" />
      {[0.35, 0.85, 1.35].map((y) => <Box key={y} size={[1.7, 0.05, 0.5]} position={[0, y, 0]} color="#cbd5e1" />)}
      {[0.35, 0.85, 1.35].flatMap((y, r) => [-0.6, -0.2, 0.2, 0.6].map((x, c) => <Box key={`${y}${x}`} size={[0.3, 0.3, 0.3]} position={[x, y + 0.18, 0]} color={colors[(r + c) % colors.length]!} />))}
    </group>
  );
}

/** Mobilier de chaque type de poste. */
function Furniture({ kind }: { kind: StationKind }) {
  switch (kind) {
    case "cashier":
    case "counter":
      return (
        <group>
          <Box size={[1.8, 0.95, 0.7]} position={[0, 0.48, 0]} color="#f1f5f9" />
          <Box size={[1.9, 0.06, 0.8]} position={[0, 0.98, 0]} color="#334155" />
          {kind === "cashier" ? (
            <>
              <Box size={[0.55, 0.25, 0.4]} position={[-0.3, 1.13, 0]} color="#0f172a" />
              <Box size={[0.4, 0.3, 0.04]} position={[-0.3, 1.42, -0.1]} color="#38bdf8" />
            </>
          ) : (
            <Cyl r={0.12} h={0.12} position={[0.4, 1.07, 0]} color="#facc15" />
          )}
        </group>
      );
    case "kitchen":
      return (
        <group>
          <Box size={[1.9, 0.9, 0.8]} position={[0, 0.45, 0]} color="#cbd5e1" />
          {[-0.5, 0, 0.5].map((x) => <Cyl key={x} r={0.16} h={0.04} position={[x, 0.93, 0]} color="#111827" />)}
          <Cyl r={0.22} r2={0.18} h={0.3} position={[0, 1.1, 0]} color="#94a3b8" />
          <Box size={[1.4, 0.25, 0.6]} position={[0, 2.1, 0]} color="#94a3b8" />
        </group>
      );
    case "stock":
      return <Shelf position={[0, 0, 0]} />;
    case "repair_bay":
      return (
        <group>
          <Box size={[2.1, 0.08, 1.4]} position={[0, 0.04, 0]} color="#facc15" />
          <Car position={[0, 0.1, 0]} color="#ef4444" />
          <Box size={[0.4, 0.6, 0.3]} position={[0.95, 0.3, 0.6]} color="#b91c1c" />
        </group>
      );
    case "vehicle":
      return (
        <group>
          <Box size={[1.9, 1.0, 0.95]} position={[0.1, 0.65, 0]} color="#f8fafc" />
          <Box size={[0.55, 0.7, 0.95]} position={[-0.95, 0.5, 0]} color="#e2e8f0" />
          {[[-0.6, 0.48], [0.7, 0.48], [-0.6, -0.48], [0.7, -0.48]].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x!, 0.2, z!]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.2, 0.2, 0.12, 16]} />
              <meshStandardMaterial color="#111827" />
            </mesh>
          ))}
        </group>
      );
    case "reception":
      return (
        <group>
          <Box size={[1.9, 1.0, 0.5]} position={[0, 0.5, 0]} color="#f8fafc" />
          <Box size={[0.5, 1.0, 1.0]} position={[0.95, 0.5, 0.25]} color="#f8fafc" />
          <Box size={[0.5, 0.35, 0.04]} position={[-0.3, 1.25, -0.1]} color="#0f172a" />
        </group>
      );
    case "meeting":
      return (
        <group>
          <Box size={[2.0, 0.07, 1.0]} position={[0, 0.75, 0]} color="#a16207" />
          <Box size={[0.12, 0.72, 0.12]} position={[0, 0.36, 0]} color="#713f12" />
          {[-0.65, 0, 0.65].flatMap((x) => [-0.75, 0.75].map((z) => <Box key={`${x}${z}`} size={[0.4, 0.45, 0.4]} position={[x, 0.22, z]} color="#334155" />))}
        </group>
      );
    case "bed":
      return (
        <group>
          <Box size={[1.4, 0.4, 2.0]} position={[0, 0.2, 0]} color="#a16207" />
          <Box size={[1.3, 0.2, 1.9]} position={[0, 0.5, 0]} color="#f8fafc" />
          <Box size={[1.0, 0.15, 0.35]} position={[0, 0.65, -0.7]} color="#bfdbfe" />
        </group>
      );
    case "salon_chair":
      return (
        <group>
          <Box size={[0.7, 0.5, 0.7]} position={[0, 0.45, 0]} color="#be185d" />
          <Box size={[0.7, 0.8, 0.15]} position={[0, 0.9, -0.3]} color="#be185d" />
          <Box size={[1.1, 1.2, 0.05]} position={[0, 1.4, -0.7]} color="#e0f2fe" />
        </group>
      );
    case "classroom":
      return (
        <group>
          <Box size={[1.8, 1.0, 0.06]} position={[0, 1.4, -0.7]} color="#14532d" />
          {[-0.5, 0.5].map((x) => <Box key={x} size={[0.7, 0.06, 0.45]} position={[x, 0.65, 0.2]} color="#d4a373" />)}
        </group>
      );
    case "desk":
    default:
      return (
        <group>
          <Box size={[1.6, 0.07, 0.8]} position={[0, 0.75, 0]} color="#d4a373" />
          {[[-0.72, -0.33], [0.72, -0.33], [-0.72, 0.33], [0.72, 0.33]].map(([x, z]) => <Box key={`${x}${z}`} size={[0.06, 0.72, 0.06]} position={[x!, 0.36, z!]} color="#7c5a3a" />)}
          <Box size={[0.65, 0.42, 0.05]} position={[0, 1.05, -0.2]} color="#0f172a" />
          <Box size={[0.45, 0.45, 0.45]} position={[0, 0.25, 0.65]} color="#334155" />
        </group>
      );
  }
}

/** Personnage : membre réel de l'équipe (ou personnage de démonstration signalé). */
function Person({ position, color, skin, phase, name, onClick }: { position: [number, number, number]; color: string; skin: string; phase: number; name: string; onClick: () => void }) {
  const ref = useRef<Group>(null);
  const { compact } = useContext(LabelCtx);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() + phase;
    ref.current.position.y = Math.abs(Math.sin(t * 1.6)) * 0.05;
    ref.current.rotation.y = Math.sin(t * 0.5) * 0.35;
  });
  return (
    <group position={position}>
      <group ref={ref} onClick={(e) => (e.stopPropagation(), onClick())}>
        <Box size={[0.3, 0.45, 0.2]} position={[0, 0.23, 0]} color="#1f2937" />
        <mesh position={[0, 0.72, 0]}>
          <capsuleGeometry args={[0.2, 0.3, 4, 12]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.15, 0]}>
          <sphereGeometry args={[0.17, 16, 12]} />
          <meshStandardMaterial color={skin} roughness={0.6} />
        </mesh>
      </group>
      {!compact && (
        <Label position={[0, 1.55, 0]} z={15}>
          <span className="pointer-events-none whitespace-nowrap rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-medium text-white">{name}</span>
        </Label>
      )}
    </group>
  );
}

function StationNode({ station: s, index, accent, onOpen }: { station: SceneStation; index: number; accent: string; onOpen: (target: string) => void }) {
  const [hover, setHover] = useState(false);
  const ring = useRef<Mesh>(null);
  const busy = (s.stats?.today ?? 0) > 0 || (s.stats?.open ?? 0) > 0;
  const badge = stationBadge(s);
  const { compact } = useContext(LabelCtx);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const t = (clock.getElapsedTime() * 0.8 + index * 0.3) % 1;
    ring.current.scale.setScalar(1 + t * 0.35);
    (ring.current.material as unknown as { opacity: number }).opacity = 0.45 * (1 - t);
  });
  const open = () => onOpen(s.target);
  return (
    <group position={[s.x, 0, s.z]}>
      {/* Zone cliquable au sol, mise en valeur au survol */}
      <mesh
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => (e.stopPropagation(), open())}
        onPointerOver={(e) => (e.stopPropagation(), setHover(true), (document.body.style.cursor = "pointer"))}
        onPointerOut={() => (setHover(false), (document.body.style.cursor = ""))}
      >
        <planeGeometry args={[2.5, 2.1]} />
        <meshStandardMaterial color={hover ? accent : "#ffffff"} transparent opacity={hover ? 0.35 : 0.18} />
      </mesh>
      {busy && (
        <mesh ref={ring} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.05, 1.15, 40]} />
          <meshBasicMaterial color={accent} transparent opacity={0.4} />
        </mesh>
      )}
      <group position={[0, hover ? 0.08 : 0, -0.15]} onClick={(e) => (e.stopPropagation(), open())}>
        <Furniture kind={s.kind} />
      </group>
      {s.crew.slice(0, 3).map((m, i) => (
        <Person key={m.id} position={[-0.6 + i * 0.6, 0, 0.75]} color={ROLE_COLORS[m.role] ?? "#334155"} skin={SKIN[(index + i) % SKIN.length]!} phase={index + i * 1.7} name={m.name} onClick={open} />
      ))}
      <Label position={[0, 2.35, 0]} z={20} interactive>
        <button
          type="button"
          onClick={open}
          className={`flex flex-col items-center whitespace-nowrap rounded-lg border bg-white/95 px-2.5 py-1 text-[11px] leading-tight shadow-sm transition-transform hover:-translate-y-0.5 ${hover ? "border-blue-400" : "border-slate-200"}`}
        >
          <span className="font-semibold text-slate-900" title={s.label}>{compact ? s.label.split(" · ")[0] : s.label}</span>
          {badge && (!compact || badge.tone === "alert") && <span className={badge.tone === "alert" ? "font-medium text-red-600" : badge.tone === "active" ? "text-blue-700" : "text-slate-500"}>{badge.text}</span>}
        </button>
      </Label>
    </group>
  );
}

function StatsBoard({ station: s, kpis, demo, onOpen }: { station: SceneStation; kpis: SceneProps["kpis"]; demo: boolean; onOpen: (target: string) => void }) {
  const { compact } = useContext(LabelCtx);
  if (compact)
    return (
      <group position={[s.x, 0, s.z]}>
        <Box size={[3.4, 1.9, 0.08]} position={[0, 1.75, 0]} color="#0f172a" onClick={() => onOpen(s.target)} />
        <Label position={[0, 2.9, 0.06]} z={18} interactive>
          <button type="button" onClick={() => onOpen(s.target)} className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow">
            {s.label}{demo ? " · démo" : ""}
          </button>
        </Label>
      </group>
    );
  return (
    <group position={[s.x, 0, s.z]}>
      <Box size={[3.4, 1.9, 0.08]} position={[0, 1.75, 0]} color="#0f172a" onClick={() => onOpen(s.target)} />
      <Label position={[0, 1.75, 0.06]} z={18} interactive>
        <button type="button" onClick={() => onOpen(s.target)} className="block w-[210px] rounded-md p-2 text-left text-white" aria-label="Ouvrir les statistiques">
          <span className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-300">
            {s.label}
            {demo && <span className="rounded bg-amber-400 px-1 text-[9px] font-semibold text-slate-900">Démo</span>}
          </span>
          {kpis.length === 0 ? (
            <span className="block text-[11px] text-slate-300">Pas encore d&apos;indicateur.</span>
          ) : (
            <span className="grid grid-cols-2 gap-x-3 gap-y-1">
              {kpis.map((k) => (
                <span key={k.label} className="block min-w-0">
                  <span className="block truncate text-[9px] text-slate-400">{k.label}</span>
                  <span className="block truncate text-sm font-bold">{fmtNumber(k.value, k.unit)}</span>
                </span>
              ))}
            </span>
          )}
        </button>
      </Label>
      {s.crew.slice(0, 2).map((m, i) => (
        <Person key={m.id} position={[-0.5 + i * 1.0, 0, 0.9]} color={ROLE_COLORS[m.role] ?? "#334155"} skin={SKIN[(i + 2) % SKIN.length]!} phase={i * 2.1} name={m.name} onClick={() => onOpen(s.target)} />
      ))}
    </group>
  );
}

// ---------- Garage : zones fonctionnelles ----------

const BAY_COLORS: Record<string, string> = { diagnostic: "#8b5cf6", reparation: "#3b82f6", controle: "#f59e0b" };

/** Plan du garage : zones cliquables (la zone ouverte est mise en évidence) et véhicules enregistrés. */
function GarageFloor({ garage, accent }: { garage: GarageSceneProps; accent: string }) {
  const { compact } = useContext(LabelCtx);
  const P = GARAGE_PARKING;
  return (
    <group>
      {/* Parking clients : un clic ouvre l'accueil */}
      <mesh position={[P.x, 0.012, P.z]} rotation={[-Math.PI / 2, 0, 0]} onClick={(e) => (e.stopPropagation(), garage.onZone("accueil"))}>
        <planeGeometry args={[P.w, P.d]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      {[-6, -4.25, -2.35, -0.5].map((x) => <Box key={x} size={[0.06, 0.02, 1.9]} position={[x + 0.03, 0.02, P.z + 0.3]} color="#f8fafc" />)}
      {!compact && (
        <Label position={[P.x, 0.9, P.z + 1.25]} z={8}>
          <span className="whitespace-nowrap rounded-md bg-slate-700/80 px-2 py-0.5 text-[10px] font-medium text-white">Parking clients</span>
        </Label>
      )}
      {garage.areas.map((a) => <GarageArea key={a.id} area={a} selected={garage.selected === a.id} accent={accent} onZone={garage.onZone} />)}
      {GARAGE_BAYS.map((b, i) => {
        const v = garage.bays[i];
        return (
          <group key={i} position={[b.x, 0, b.z]} onClick={(e) => (e.stopPropagation(), garage.onZone("atelier"))}>
            <Box size={[2.0, 0.06, 1.3]} position={[0, 0.03, 0]} color="#facc15" />
            {[-1.05, 1.05].map((x) => <Box key={x} size={[0.14, 1.7, 0.14]} position={[x, 0.85, -0.55]} color="#334155" />)}
            {v && <Car position={[0, 0.08, 0]} color={BAY_COLORS[v.status] ?? "#64748b"} />}
            {v && !compact && (
              <Label position={[0, 1.55, 0]} z={12}>
                <span className="whitespace-nowrap rounded bg-white/95 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-900 shadow">{v.plate}</span>
              </Label>
            )}
          </group>
        );
      })}
      {garage.extraInWorkshop > 0 && (
        <Label position={[1.1, 0.6, -0.4]} z={12}>
          <span className="whitespace-nowrap rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">+{garage.extraInWorkshop} en atelier</span>
        </Label>
      )}
      {GARAGE_SPOTS.map((s, i) => {
        const v = garage.parked[i];
        if (!v) return null;
        return (
          <group key={v.id} position={[s.x, 0, s.z]} rotation={[0, Math.PI / 2, 0]} onClick={(e) => (e.stopPropagation(), garage.onZone("accueil"))}>
            <Car position={[0, 0, 0]} color={v.ready ? "#16a34a" : "#94a3b8"} />
            {!compact && (
              <Label position={[0, 1.35, 0]} z={12}>
                <span className={`whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow ${v.ready ? "bg-green-600 text-white" : "bg-white/95 text-slate-900"}`}>{v.plate}{v.ready ? " · prêt" : ""}</span>
              </Label>
            )}
          </group>
        );
      })}
      {garage.extraParked > 0 && (
        <Label position={[-0.9, 0.6, 3.9]} z={12}>
          <span className="whitespace-nowrap rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-white">+{garage.extraParked}</span>
        </Label>
      )}
    </group>
  );
}

function GarageArea({ area: a, selected, accent, onZone }: { area: GarageAreaView; selected: boolean; accent: string; onZone: (z: GarageAreaView["id"]) => void }) {
  const [hover, setHover] = useState(false);
  const { compact } = useContext(LabelCtx);
  const open = () => onZone(a.id);
  const wall = selected ? accent : "#94a3b8";
  const h = selected ? 0.5 : 0.32;
  const t = selected ? 0.1 : 0.06;
  return (
    <group>
      <mesh
        position={[a.x, 0.015, a.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => (e.stopPropagation(), open())}
        onPointerOver={(e) => (e.stopPropagation(), setHover(true), (document.body.style.cursor = "pointer"))}
        onPointerOut={() => (setHover(false), (document.body.style.cursor = ""))}
      >
        <planeGeometry args={[a.w - 0.08, a.d - 0.08]} />
        <meshStandardMaterial color={selected || hover ? accent : "#ffffff"} transparent opacity={selected ? 0.4 : hover ? 0.24 : 0.14} />
      </mesh>
      {/* Cloisons basses : contour de la zone, renforcé quand elle est sélectionnée */}
      <Box size={[a.w, h, t]} position={[a.x, h / 2, a.z - a.d / 2]} color={wall} />
      <Box size={[a.w, h, t]} position={[a.x, h / 2, a.z + a.d / 2]} color={wall} />
      <Box size={[t, h, a.d]} position={[a.x - a.w / 2, h / 2, a.z]} color={wall} />
      <Box size={[t, h, a.d]} position={[a.x + a.w / 2, h / 2, a.z]} color={wall} />
      <group onClick={(e) => (e.stopPropagation(), open())}>
        <AreaFurniture id={a.id} x={a.x} z={a.z} />
      </group>
      <Label position={[a.x, a.id === "atelier" ? 1.1 : 2.1, a.id === "atelier" ? a.z + a.d / 2 - 0.9 : a.z]} z={selected ? 30 : 20} interactive>
        <button
          type="button"
          onClick={open}
          aria-pressed={selected}
          className={`flex flex-col items-center whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] leading-tight shadow-sm transition-transform hover:-translate-y-0.5 ${selected ? "border-transparent text-white" : hover ? "border-blue-400 bg-white/95" : "border-slate-200 bg-white/95"}`}
          style={selected ? { background: accent } : undefined}
        >
          <span className={`font-semibold ${selected ? "" : "text-slate-900"}`}>{a.label}</span>
          {a.badge && (!compact || a.badge.tone === "alert") && <span className={selected ? "text-white/90" : a.badge.tone === "alert" ? "font-medium text-red-600" : a.badge.tone === "active" ? "text-blue-700" : "text-slate-500"}>{a.badge.text}</span>}
        </button>
      </Label>
    </group>
  );
}

function AreaFurniture({ id, x, z }: { id: GarageAreaView["id"]; x: number; z: number }) {
  if (id === "atelier")
    return (
      <group>
        <Box size={[1.6, 0.9, 0.6]} position={[-5.4, 0.45, 1.1]} color="#b91c1c" />
        <Box size={[1.6, 0.06, 0.7]} position={[-5.4, 0.93, 1.1]} color="#334155" />
        <Box size={[0.5, 1.2, 0.4]} position={[0.9, 0.6, 1.1]} color="#1d4ed8" />
      </group>
    );
  if (id === "stock")
    return (
      <group>
        <Shelf position={[x - 1.05, 0, z - 0.75]} />
        <Shelf position={[x + 1.05, 0, z - 0.75]} />
      </group>
    );
  if (id === "bureau")
    return (
      <group position={[x, 0, z - 0.2]}>
        <Furniture kind="desk" />
      </group>
    );
  if (id === "accueil")
    return (
      <group position={[x, 0, z - 0.4]}>
        <Furniture kind="reception" />
      </group>
    );
  return (
    <group position={[x, 0, z]}>
      <Box size={[1.6, 0.4, 0.7]} position={[-0.6, 0.25, -0.7]} color="#64748b" />
      <Box size={[1.6, 0.5, 0.2]} position={[-0.6, 0.6, -1.0]} color="#64748b" />
      <Cyl r={0.45} h={0.05} position={[-0.5, 0.55, 0.35]} color="#d4a373" />
      <Cyl r={0.06} h={0.52} position={[-0.5, 0.27, 0.35]} color="#713f12" />
      <Box size={[0.6, 1.5, 0.6]} position={[1.2, 0.75, -0.8]} color="#e2e8f0" />
    </group>
  );
}

// ---------- Restaurant et hôtel : zones déclarées ----------

const ROOM_COLORS: Record<string, string> = { disponible: "#86efac", reservee: "#c4b5fd", occupee: "#93c5fd", a_nettoyer: "#fcd34d", maintenance: "#fca5a5" };

/** Plan du restaurant ou de l'hôtel : zones cliquables (zone ouverte mise en évidence) et chambres enregistrées. */
function VenueFloor({ venue, accent }: { venue: VenueSceneProps; accent: string }) {
  return (
    <group>
      {venue.areas.map((a, i) => <VenueArea key={`${a.id}-${i}`} area={a} selected={venue.selected === a.id && (a.id !== "chambres" || !venue.selectedRoom)} accent={accent} onZone={venue.onZone} kind={venue.kind} />)}
      {venue.rooms.map((r) => <RoomTile key={r.id} room={r} selected={venue.selectedRoom === r.id} accent={accent} onRoom={venue.onRoom} />)}
      {venue.extraRooms > 0 && (
        <Label position={[5.6, 0.8, 1.2]} z={12}>
          <span className="whitespace-nowrap rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-white">+{venue.extraRooms} chambres</span>
        </Label>
      )}
    </group>
  );
}

function VenueArea({ area: a, selected, accent, onZone, kind }: { area: VenueAreaView; selected: boolean; accent: string; onZone: (z: VenueAreaView["id"]) => void; kind: "restaurant" | "hotel" }) {
  const [hover, setHover] = useState(false);
  const { compact } = useContext(LabelCtx);
  const open = () => onZone(a.id);
  const wall = selected ? accent : "#94a3b8";
  const h = selected ? 0.55 : 0.34;
  const t = selected ? 0.1 : 0.06;
  const floor = a.id === "terrasse" ? "#d6d3d1" : a.id === "froid" ? "#e0f2fe" : a.id === "toilettes" ? "#f1f5f9" : a.tint ?? "#ffffff";
  return (
    <group>
      <mesh
        position={[a.x, 0.015, a.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => (e.stopPropagation(), open())}
        onPointerOver={(e) => (e.stopPropagation(), setHover(true), (document.body.style.cursor = "pointer"))}
        onPointerOut={() => (setHover(false), (document.body.style.cursor = ""))}
      >
        <planeGeometry args={[a.w - 0.08, a.d - 0.08]} />
        <meshStandardMaterial color={selected || hover ? accent : floor} transparent opacity={selected ? 0.42 : hover ? 0.28 : a.tint || a.id === "froid" || a.id === "terrasse" ? 0.55 : 0.16} />
      </mesh>
      {a.id === "terrasse" ? (
        <>
          {/* Garde-corps de la terrasse (extérieur) */}
          <Box size={[0.05, 0.7, a.d]} position={[a.x - a.w / 2, 0.35, a.z]} color="#334155" />
          <Box size={[a.w, 0.7, 0.05]} position={[a.x, 0.35, a.z + a.d / 2]} color="#334155" />
          <Box size={[t, h, a.d]} position={[a.x + a.w / 2, h / 2, a.z]} color={wall} />
        </>
      ) : (
        <>
          <Box size={[a.w, h, t]} position={[a.x, h / 2, a.z - a.d / 2]} color={wall} />
          <Box size={[a.w, h, t]} position={[a.x, h / 2, a.z + a.d / 2]} color={wall} />
          <Box size={[t, h, a.d]} position={[a.x - a.w / 2, h / 2, a.z]} color={wall} />
          <Box size={[t, h, a.d]} position={[a.x + a.w / 2, h / 2, a.z]} color={wall} />
        </>
      )}
      <group onClick={(e) => (e.stopPropagation(), open())}>
        <VenueFurniture id={a.id} a={a} kind={kind} />
      </group>
      {a.showLabel && (
        <Label position={[a.x, a.id === "chambres" ? 1.7 : 2.1, a.id === "chambres" ? a.z + a.d / 2 - 0.2 : a.z]} z={selected ? 30 : 20} interactive>
          <button
            type="button"
            onClick={open}
            aria-pressed={selected}
            className={`flex flex-col items-center whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] leading-tight shadow-sm transition-transform hover:-translate-y-0.5 ${selected ? "border-transparent text-white" : hover ? "border-blue-400 bg-white/95" : "border-slate-200 bg-white/95"}`}
            style={selected ? { background: accent } : undefined}
          >
            <span className={`font-semibold ${selected ? "" : "text-slate-900"}`}>{a.label}</span>
            {a.badge && (!compact || a.badge.tone === "alert") && <span className={selected ? "text-white/90" : a.badge.tone === "alert" ? "font-medium text-red-600" : a.badge.tone === "active" ? "text-blue-700" : "text-slate-500"}>{a.badge.text}</span>}
          </button>
        </Label>
      )}
    </group>
  );
}

function DiningSet({ position, chairs = 4 }: { position: [number, number, number]; chairs?: number }) {
  return (
    <group position={position}>
      <Cyl r={0.42} h={0.05} position={[0, 0.72, 0]} color="#8b5a2b" />
      <Cyl r={0.06} h={0.7} position={[0, 0.35, 0]} color="#5b3a1a" />
      {Array.from({ length: chairs }, (_, k) => <Box key={k} size={[0.3, 0.42, 0.3]} position={[Math.cos((k * 2 * Math.PI) / chairs) * 0.68, 0.21, Math.sin((k * 2 * Math.PI) / chairs) * 0.68]} color="#a16207" />)}
    </group>
  );
}

function VenueFurniture({ id, a, kind }: { id: VenueAreaView["id"]; a: VenueAreaView; kind: "restaurant" | "hotel" }) {
  const { x, z, w, d } = a;
  switch (id) {
    case "cuisine":
      return (
        <group>
          <group position={[x - w / 2 + 1.2, 0, z - d / 2 + 0.6]}><Furniture kind="kitchen" /></group>
          {w > 4 && <Box size={[1.6, 0.9, 0.7]} position={[x + 0.6, 0.45, z + 0.3]} color="#cbd5e1" />}
          <Box size={[0.7, 1.8, 0.6]} position={[x + w / 2 - 0.5, 0.9, z - d / 2 + 0.45]} color="#e2e8f0" />
        </group>
      );
    case "stock":
      return <Shelf position={[x, 0, z - 0.6]} />;
    case "froid":
      return (
        <group>
          <Box size={[1.6, 1.9, 1.2]} position={[x, 0.95, z - 0.4]} color="#f8fafc" />
          <Box size={[0.08, 1.5, 0.8]} position={[x + 0.82, 0.85, z - 0.4]} color="#94a3b8" />
          <Box size={[0.4, 0.25, 0.04]} position={[x - 0.3, 1.5, z + 0.22]} color="#0ea5e9" />
        </group>
      );
    case "toilettes":
      return (
        <group>
          {[-0.6, 0.6].map((dx) => (
            <group key={dx} position={[x + dx, 0, z - 0.7]}>
              <Box size={[0.4, 0.42, 0.55]} position={[0, 0.21, 0]} color="#f8fafc" />
              <Box size={[0.4, 0.5, 0.15]} position={[0, 0.55, -0.22]} color="#f1f5f9" />
            </group>
          ))}
          <Box size={[1.4, 0.8, 0.45]} position={[x, 0.4, z + 0.85]} color="#e2e8f0" />
          <Box size={[0.06, 1.4, 1.3]} position={[x, 0.7, z - 0.6]} color="#cbd5e1" />
        </group>
      );
    case "salle":
    case "restaurant": {
      const cols = Math.max(1, Math.floor((w - 0.8) / 1.9));
      const rows = Math.max(1, Math.floor((d - 0.8) / 1.9));
      const sets: [number, number, number][] = [];
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) sets.push([x - ((cols - 1) * 1.9) / 2 + i * 1.9, 0, z - ((rows - 1) * 1.9) / 2 + j * 1.9]);
      return <group>{sets.slice(0, 12).map((p, i) => <DiningSet key={i} position={p} />)}</group>;
    }
    case "terrasse":
      return (
        <group>
          {[z - 1.6, z + 0.9].map((zz) => (
            <group key={zz}>
              <DiningSet position={[x, 0, zz]} chairs={2} />
              <Cyl r={0.04} h={1.9} position={[x, 0.95, zz]} color="#475569" />
              <mesh position={[x, 1.95, zz]}><coneGeometry args={[0.9, 0.35, 16]} /><meshStandardMaterial color="#f97316" /></mesh>
            </group>
          ))}
          <Plant position={[x - 0.7, 0, z + d / 2 - 0.5]} />
        </group>
      );
    case "caisse":
      return <group position={[x, 0, z - 0.4]}><Furniture kind="cashier" /></group>;
    case "reception":
      return (
        <group>
          <group position={[x + 1.5, 0, z - 0.5]}><Furniture kind="reception" /></group>
          <Box size={[1.6, 0.4, 0.7]} position={[x - 2.8, 0.25, z + 0.3]} color="#64748b" />
          <Box size={[1.6, 0.5, 0.2]} position={[x - 2.8, 0.6, z + 0.6]} color="#64748b" />
          <Plant position={[x - w / 2 + 0.5, 0, z - d / 2 + 0.5]} />
        </group>
      );
    case "bureau":
      return <group position={[x, 0, z - 0.2]}><Furniture kind="desk" /></group>;
    case "chambres":
      return null;
  }
  return kind ? null : null;
}

function RoomTile({ room, selected, accent, onRoom }: { room: VenueSceneProps["rooms"][number]; selected: boolean; accent: string; onRoom: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  const { compact } = useContext(LabelCtx);
  const h = selected ? 0.9 : 0.55;
  const wall = selected ? accent : "#94a3b8";
  const open = () => onRoom(room.id);
  return (
    <group>
      <mesh
        position={[room.x, 0.02, room.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => (e.stopPropagation(), open())}
        onPointerOver={(e) => (e.stopPropagation(), setHover(true), (document.body.style.cursor = "pointer"))}
        onPointerOut={() => (setHover(false), (document.body.style.cursor = ""))}
      >
        <planeGeometry args={[room.w - 0.06, room.d - 0.06]} />
        <meshStandardMaterial color={selected ? accent : ROOM_COLORS[room.state] ?? "#e2e8f0"} transparent opacity={selected ? 0.75 : hover ? 0.9 : 0.6} />
      </mesh>
      <Box size={[room.w, h, 0.05]} position={[room.x, h / 2, room.z - room.d / 2]} color={wall} />
      <Box size={[0.05, h, room.d]} position={[room.x - room.w / 2, h / 2, room.z]} color={wall} />
      <Box size={[0.05, h, room.d]} position={[room.x + room.w / 2, h / 2, room.z]} color={wall} />
      <group position={[room.x, 0, room.z - 0.35]} scale={0.6} onClick={(e) => (e.stopPropagation(), open())}>
        <Furniture kind="bed" />
      </group>
      <Label position={[room.x, 1.2, room.z + room.d / 2 - 0.35]} z={selected ? 32 : 22} interactive>
        <button type="button" onClick={open} aria-pressed={selected} aria-label={`Chambre ${room.number} : ${room.stateLabel}`} className={`flex flex-col items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] leading-tight shadow-sm ${selected ? "border-transparent text-white" : "border-slate-200 bg-white/95"}`} style={selected ? { background: accent } : undefined}>
          <span className={`font-bold ${selected ? "" : "text-slate-900"}`}>{room.number}</span>
          {!compact && <span className={selected ? "text-white/90" : "text-slate-500"}>{room.stateLabel}</span>}
        </button>
      </Label>
    </group>
  );
}
