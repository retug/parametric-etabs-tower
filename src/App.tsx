import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type FloorPlateInput = {
  widthFt: number;
  lengthFt: number;
  columnSpacingFt: number;
  firstFloorHeightFt: number;
};

type Point3 = {
  x: number;
  y: number;
  z: number;
};

type FloorPlateModel = {
  columns: Point3[];
  beams: [Point3, Point3][];
  floorCorners: Point3[];
};

function getEvenGridValues(totalLength: number, targetSpacing: number): number[] {
  const numberOfBays = Math.max(1, Math.ceil(totalLength / targetSpacing));
  const actualSpacing = totalLength / numberOfBays;

  const values: number[] = [];

  for (let i = 0; i <= numberOfBays; i++) {
    values.push(i * actualSpacing);
  }

  return values;
}

function generateFloorPlate(input: FloorPlateInput): FloorPlateModel {
  const { widthFt, lengthFt, columnSpacingFt, firstFloorHeightFt } = input;

  const xValues = getEvenGridValues(widthFt, columnSpacingFt);
  const yValues = getEvenGridValues(lengthFt, columnSpacingFt);

  const columns: Point3[] = [];

  for (const x of xValues) {
    for (const y of yValues) {
      columns.push({ x, y, z: 0 });
    }
  }

  const beams: [Point3, Point3][] = [];

  for (const y of yValues) {
    for (let i = 0; i < xValues.length - 1; i++) {
      beams.push([
        { x: xValues[i], y, z: firstFloorHeightFt },
        { x: xValues[i + 1], y, z: firstFloorHeightFt },
      ]);
    }
  }

  for (const x of xValues) {
    for (let i = 0; i < yValues.length - 1; i++) {
      beams.push([
        { x, y: yValues[i], z: firstFloorHeightFt },
        { x, y: yValues[i + 1], z: firstFloorHeightFt },
      ]);
    }
  }

  const floorCorners: Point3[] = [
    { x: 0, y: 0, z: firstFloorHeightFt },
    { x: widthFt, y: 0, z: firstFloorHeightFt },
    { x: widthFt, y: lengthFt, z: firstFloorHeightFt },
    { x: 0, y: lengthFt, z: firstFloorHeightFt },
  ];

  return {
    columns,
    beams,
    floorCorners,
  };
}

function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [input, setInput] = useState<FloorPlateInput>({
    widthFt: 120,
    lengthFt: 180,
    columnSpacingFt: 30,
    firstFloorHeightFt: 20,
  });

  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;
    mount.innerHTML = "";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101820);

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 5000);
    camera.position.set(180, 150, 220);
    camera.lookAt(60, 20, 90);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
    directionalLight.position.set(100, 200, 100);
    scene.add(directionalLight);

    const grid = new THREE.GridHelper(300, 30, 0x666666, 0x333333);
    scene.add(grid);

    const axes = new THREE.AxesHelper(40);
    scene.add(axes);

    const model = generateFloorPlate(input);

    const columnMaterial = new THREE.MeshStandardMaterial({
      color: 0xd6d6d6,
      metalness: 0.4,
      roughness: 0.35,
    });

    const beamMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.5,
      roughness: 0.3,
    });

    const slabMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f9bd3,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });

    const columnSize = 2.5;
    const beamDepth = 2.0;
    const beamWidth = 1.5;

    for (const column of model.columns) {
      const geometry = new THREE.BoxGeometry(
        columnSize,
        input.firstFloorHeightFt,
        columnSize
      );

      const mesh = new THREE.Mesh(geometry, columnMaterial);

      mesh.position.set(
        column.x,
        input.firstFloorHeightFt / 2,
        column.y
      );

      scene.add(mesh);
    }

    for (const [a, b] of model.beams) {
      const start = new THREE.Vector3(a.x, a.z, a.y);
      const end = new THREE.Vector3(b.x, b.z, b.y);
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const length = start.distanceTo(end);

      const geometry = new THREE.BoxGeometry(length, beamDepth, beamWidth);
      const mesh = new THREE.Mesh(geometry, beamMaterial);

      mesh.position.copy(midpoint);

      const direction = end.clone().sub(start).normalize();
      const angle = Math.atan2(direction.z, direction.x);
      mesh.rotation.y = -angle;

      scene.add(mesh);
    }

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(input.widthFt, 0);
    shape.lineTo(input.widthFt, input.lengthFt);
    shape.lineTo(0, input.lengthFt);
    shape.lineTo(0, 0);

    const slabGeometry = new THREE.ShapeGeometry(shape);
    const slab = new THREE.Mesh(slabGeometry, slabMaterial);

    slab.rotation.x = -Math.PI / 2;
    slab.position.y = input.firstFloorHeightFt + 0.1;

    scene.add(slab);

    let animationId = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      scene.rotation.y += 0.0015;

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

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
    };
  }, [input]);

  async function handleMakeEtabsModel() {
  const model = generateFloorPlate(input);

  setStatus("Sending model to ETABS bridge...");

  try {
    const response = await fetch("http://localhost:5055/api/etabs/create-floor", {
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

    console.log("ETABS bridge response:", text);

    if (!response.ok) {
      setStatus("ETABS bridge error. Check backend terminal.");
      return;
    }

    setStatus("ETABS model created.");
  } catch (error) {
    console.error("Fetch/network error:", error);
    setStatus("Could not reach ETABS bridge. Is dotnet run active?");
  }
}

  return (
    <div style={{ display: "flex", height: "100vh", background: "#111" }}>
      <div
        style={{
          width: "320px",
          padding: "20px",
          color: "white",
          fontFamily: "Arial, sans-serif",
          background: "#181818",
          borderRight: "1px solid #333",
        }}
      >
        <h2>Parametric Floor Plate</h2>

        <label>Width ft</label>
        <input
          type="number"
          value={input.widthFt}
          onChange={(e) =>
            setInput({ ...input, widthFt: Number(e.target.value) })
          }
          style={inputStyle}
        />

        <label>Length ft</label>
        <input
          type="number"
          value={input.lengthFt}
          onChange={(e) =>
            setInput({ ...input, lengthFt: Number(e.target.value) })
          }
          style={inputStyle}
        />

        <label>Column Spacing ft</label>
        <input
          type="number"
          value={input.columnSpacingFt}
          onChange={(e) =>
            setInput({ ...input, columnSpacingFt: Number(e.target.value) })
          }
          style={inputStyle}
        />

        <label>First Floor Height ft</label>
        <input
          type="number"
          value={input.firstFloorHeightFt}
          onChange={(e) =>
            setInput({ ...input, firstFloorHeightFt: Number(e.target.value) })
          }
          style={inputStyle}
        />

        <button
          onClick={handleMakeEtabsModel}
          style={{
            width: "100%",
            padding: "12px",
            marginTop: "16px",
            background: "#2f9bd3",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Make ETABS Model
        </button>

        <p style={{ marginTop: "16px", color: "#bbb" }}>{status}</p>
      </div>

      <div ref={mountRef} style={{ flex: 1 }} />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px",
  marginTop: "4px",
  marginBottom: "12px",
  borderRadius: "4px",
  border: "1px solid #444",
  background: "#222",
  color: "white",
};

export default App;