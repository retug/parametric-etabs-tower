import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type TowerInput = {
  totalFloors: number;
  widthFt: number;
  lengthFt: number;
  columnSpacingFt: number;
  storyHeightFt: number;
  neckingPercent: number;
  twistDegPerFloor: number;
};

type Point3 = {
  x: number;
  y: number;
  z: number;
};

type FloorPlate = {
  floor: number;
  elevation: number;
  width: number;
  length: number;
  rotationDeg: number;
  corners: Point3[];
  perimeterPoints: Point3[];
};

type TowerModel = {
  floors: FloorPlate[];
  internalColumns: [Point3, Point3][];
  exteriorColumns: [Point3, Point3][];
  floorBeams: [Point3, Point3][];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function rotatePoint(x: number, y: number, angleDeg: number): Point3 {
  const a = degToRad(angleDeg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
    z: 0,
  };
}

function makePoint(x: number, y: number, z: number, rotationDeg: number): Point3 {
  const rotated = rotatePoint(x, y, rotationDeg);

  return {
    x: rotated.x,
    y: rotated.y,
    z,
  };
}

function getNeckScaleAtFloor(
  floor: number,
  totalFloors: number,
  neckingPercent: number
): number {
  const minScale = neckingPercent / 100;
  const cycles = 4;

  const t = floor / totalFloors;
  const wave = (1 + Math.cos(2 * Math.PI * cycles * t)) / 2;

  return minScale + (1 - minScale) * wave;
}

function getEvenGridValues(totalLength: number, targetSpacing: number): number[] {
  const numberOfBays = Math.max(1, Math.ceil(totalLength / targetSpacing));
  const actualSpacing = totalLength / numberOfBays;

  const values: number[] = [];

  for (let i = 0; i <= numberOfBays; i++) {
    values.push(-totalLength / 2 + i * actualSpacing);
  }

  return values;
}

function getPerimeterPoints(
  width: number,
  length: number,
  spacing: number,
  elevation: number,
  rotationDeg: number
): Point3[] {
  const points: Point3[] = [];

  const xMin = -width / 2;
  const xMax = width / 2;
  const yMin = -length / 2;
  const yMax = length / 2;

  const xValues = getEvenGridValues(width, spacing);
  const yValues = getEvenGridValues(length, spacing);

  for (const x of xValues) {
    points.push(makePoint(x, yMin, elevation, rotationDeg));
    points.push(makePoint(x, yMax, elevation, rotationDeg));
  }

  for (const y of yValues.slice(1, -1)) {
    points.push(makePoint(xMin, y, elevation, rotationDeg));
    points.push(makePoint(xMax, y, elevation, rotationDeg));
  }

  return points;
}

function getCorners(
  width: number,
  length: number,
  elevation: number,
  rotationDeg: number
): Point3[] {
  return [
    makePoint(-width / 2, -length / 2, elevation, rotationDeg),
    makePoint(width / 2, -length / 2, elevation, rotationDeg),
    makePoint(width / 2, length / 2, elevation, rotationDeg),
    makePoint(-width / 2, length / 2, elevation, rotationDeg),
  ];
}

function generateTower(input: TowerInput): TowerModel {
  const totalFloors = clamp(roundToStep(input.totalFloors, 10), 80, 200);
  const minScale = input.neckingPercent / 100;

  const floors: FloorPlate[] = [];

  for (let floor = 0; floor <= totalFloors; floor++) {
    const elevation = floor * input.storyHeightFt;
    const scale = getNeckScaleAtFloor(
      floor,
      totalFloors,
      input.neckingPercent
    );

    const width = input.widthFt * scale;
    const length = input.lengthFt * scale;
    const rotationDeg = floor * input.twistDegPerFloor;

    const corners = getCorners(width, length, elevation, rotationDeg);
    const perimeterPoints = getPerimeterPoints(
      width,
      length,
      input.columnSpacingFt,
      elevation,
      rotationDeg
    );

    floors.push({
      floor,
      elevation,
      width,
      length,
      rotationDeg,
      corners,
      perimeterPoints,
    });
  }

  const internalColumns: [Point3, Point3][] = [];

  const internalWidth = input.widthFt * minScale;
  const internalLength = input.lengthFt * minScale;

  const internalXValues = getEvenGridValues(
    internalWidth,
    input.columnSpacingFt
  );

  const internalYValues = getEvenGridValues(
    internalLength,
    input.columnSpacingFt
  );

  const fullHeight = totalFloors * input.storyHeightFt;

  for (const x of internalXValues) {
    for (const y of internalYValues) {
      internalColumns.push([
        { x, y, z: 0 },
        { x, y, z: fullHeight },
      ]);
    }
  }

  const exteriorColumns: [Point3, Point3][] = [];

  for (let i = 0; i < floors.length - 1; i++) {
    const lower = floors[i];
    const upper = floors[i + 1];

    const count = Math.min(
      lower.perimeterPoints.length,
      upper.perimeterPoints.length
    );

    for (let j = 0; j < count; j++) {
      exteriorColumns.push([
        lower.perimeterPoints[j],
        upper.perimeterPoints[j],
      ]);
    }
  }

  const floorBeams: [Point3, Point3][] = [];

  for (const floor of floors) {
    const c = floor.corners;

    floorBeams.push([c[0], c[1]]);
    floorBeams.push([c[1], c[2]]);
    floorBeams.push([c[2], c[3]]);
    floorBeams.push([c[3], c[0]]);
  }

  return {
    floors,
    internalColumns,
    exteriorColumns,
    floorBeams,
  };
}

function createLine(
  start: Point3,
  end: Point3,
  material: THREE.Material
): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(start.x, start.z, start.y),
    new THREE.Vector3(end.x, end.z, end.y),
  ]);

  return new THREE.Line(geometry, material);
}

function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [input, setInput] = useState<TowerInput>({
    totalFloors: 100,
    widthFt: 100,
    lengthFt: 100,
    columnSpacingFt: 25,
    storyHeightFt: 12,
    neckingPercent: 80,
    twistDegPerFloor: 0.5,
  });

  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;
    mount.innerHTML = "";

    const model = generateTower(input);
    const totalFloors = clamp(roundToStep(input.totalFloors, 10), 80, 200);
    const totalHeight = totalFloors * input.storyHeightFt;
    const maxPlanDimension = Math.max(input.widthFt, input.lengthFt);
    const sceneRadius = Math.max(maxPlanDimension * 2.5, totalHeight * 0.65);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1720);

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 20000);

    camera.position.set(
      sceneRadius * 0.65,
      totalHeight * 0.55,
      sceneRadius * 0.95
    );

    camera.lookAt(0, totalHeight * 0.45, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, totalHeight * 0.45, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.minDistance = maxPlanDimension * 0.25;
    controls.maxDistance = totalHeight * 2.5;
    controls.update();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.25);
    directionalLight.position.set(200, totalHeight, 200);
    scene.add(directionalLight);

    const gridSize = Math.max(maxPlanDimension * 3, 300);
    const gridDivisions = Math.max(20, Math.round(gridSize / 10));
    const grid = new THREE.GridHelper(
      gridSize,
      gridDivisions,
      0x666666,
      0x333333
    );
    scene.add(grid);

    const internalColumnMaterial = new THREE.LineBasicMaterial({
      color: 0x8ea7b8,
      transparent: true,
      opacity: 0.5,
    });

    const exteriorColumnMaterial = new THREE.LineBasicMaterial({
      color: 0xf2c14e,
      transparent: true,
      opacity: 0.95,
    });

    const floorBeamMaterial = new THREE.LineBasicMaterial({
      color: 0x2f9bd3,
      transparent: true,
      opacity: 0.35,
    });

    const slabMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f9bd3,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
    });

    for (const [start, end] of model.internalColumns) {
      scene.add(createLine(start, end, internalColumnMaterial));
    }

    for (const [start, end] of model.exteriorColumns) {
      scene.add(createLine(start, end, exteriorColumnMaterial));
    }

    for (const [start, end] of model.floorBeams) {
      scene.add(createLine(start, end, floorBeamMaterial));
    }

    for (const floor of model.floors) {
      if (
        floor.floor !== 0 &&
        floor.floor !== totalFloors &&
        floor.floor % 5 !== 0
      ) {
        continue;
      }

      const shape = new THREE.Shape();

      const localCorners = [
        [-floor.width / 2, -floor.length / 2],
        [floor.width / 2, -floor.length / 2],
        [floor.width / 2, floor.length / 2],
        [-floor.width / 2, floor.length / 2],
      ];

      shape.moveTo(localCorners[0][0], localCorners[0][1]);
      shape.lineTo(localCorners[1][0], localCorners[1][1]);
      shape.lineTo(localCorners[2][0], localCorners[2][1]);
      shape.lineTo(localCorners[3][0], localCorners[3][1]);
      shape.lineTo(localCorners[0][0], localCorners[0][1]);

      const geometry = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geometry, slabMaterial);

      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = degToRad(floor.rotationDeg);
      mesh.position.y = floor.elevation;

      scene.add(mesh);
    }

    let animationId = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current) return;

      const newWidth = mountRef.current.clientWidth;
      const newHeight = mountRef.current.clientHeight;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();

      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener("resize", handleResize);

    setStatus(
      `${totalFloors} floors | ${model.internalColumns.length} internal cols | ${model.exteriorColumns.length} exterior segments`
    );

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
    };
  }, [input]);

  function updateInput<K extends keyof TowerInput>(key: K, value: number) {
    setInput((prev) => {
      const next = {
        ...prev,
        [key]: value,
      };

      if (key === "totalFloors") {
        next.totalFloors = clamp(roundToStep(value, 10), 80, 200);
      }

      if (key === "neckingPercent") {
        next.neckingPercent = clamp(value, 40, 100);
      }

      if (key === "columnSpacingFt") {
        next.columnSpacingFt = Math.max(5, value);
      }

      if (key === "storyHeightFt") {
        next.storyHeightFt = Math.max(8, value);
      }

      return next;
    });
  }

  async function handleMakeEtabsModel() {
    const model = generateTower(input);

    setStatus("Sending tower to ETABS...");

    try {
      const response = await fetch("http://localhost:5055/api/etabs/create-tower", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input,
          model,
        }),
      });

      const text = await response.text();
      console.log("ETABS response:", text);

      if (!response.ok) {
        setStatus("ETABS bridge error. Check backend terminal.");
        return;
      }

      setStatus("ETABS tower model created.");
    } catch (error) {
      console.error(error);
      setStatus("Could not reach ETABS bridge.");
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#111" }}>
      <div
        style={{
          width: "460px",
          padding: "16px",
          color: "white",
          fontFamily: "Arial, sans-serif",
          background: "#181818",
          borderRight: "1px solid #333",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        <h2 style={{ margin: "0 0 8px 0" }}>Parametric Tower</h2>

        <p style={{ color: "#aaa", fontSize: "12px", lineHeight: 1.35 }}>
          Four repeated necking zones over the height. Internal columns are
          vertical. Exterior columns follow the necking and twist.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
        >
          <InputField
            label="Floors"
            value={input.totalFloors}
            min={80}
            max={200}
            step={10}
            onChange={(value) => updateInput("totalFloors", value)}
          />

          <InputField
            label="Width ft"
            value={input.widthFt}
            min={60}
            max={300}
            step={5}
            onChange={(value) => updateInput("widthFt", value)}
          />

          <InputField
            label="Length ft"
            value={input.lengthFt}
            min={60}
            max={300}
            step={5}
            onChange={(value) => updateInput("lengthFt", value)}
          />

          <InputField
            label="Col Spacing ft"
            value={input.columnSpacingFt}
            min={10}
            max={50}
            step={1}
            onChange={(value) => updateInput("columnSpacingFt", value)}
          />

          <InputField
            label="Story Ht ft"
            value={input.storyHeightFt}
            min={8}
            max={25}
            step={1}
            onChange={(value) => updateInput("storyHeightFt", value)}
          />

          <InputField
            label="Neck %"
            value={input.neckingPercent}
            min={40}
            max={100}
            step={1}
            onChange={(value) => updateInput("neckingPercent", value)}
          />

          <InputField
            label="Twist deg/flr"
            value={input.twistDegPerFloor}
            min={-2}
            max={2}
            step={0.1}
            onChange={(value) => updateInput("twistDegPerFloor", value)}
          />
        </div>

        <button
          onClick={handleMakeEtabsModel}
          style={{
            width: "100%",
            padding: "10px",
            marginTop: "12px",
            background: "#2f9bd3",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Make ETABS Tower
        </button>

        <div
          style={{
            marginTop: "12px",
            padding: "10px",
            borderRadius: "8px",
            background: "#222",
            border: "1px solid #333",
            color: "#bbb",
            fontSize: "12px",
            lineHeight: 1.35,
          }}
        >
          {status}
        </div>
      </div>

      <div ref={mountRef} style={{ flex: 1, minWidth: 0 }} />
    </div>
  );
}

type InputFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

function InputField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: InputFieldProps) {
  return (
    <div
      style={{
        padding: "8px",
        borderRadius: "8px",
        background: "#202020",
        border: "1px solid #303030",
      }}
    >
      <label
        style={{
          display: "block",
          marginBottom: "4px",
          fontSize: "11px",
          color: "#ddd",
        }}
      >
        {label}: <strong>{value}</strong>
      </label>

      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />

      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          padding: "5px",
          marginTop: "4px",
          borderRadius: "4px",
          border: "1px solid #444",
          background: "#222",
          color: "white",
          fontSize: "12px",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

export default App;