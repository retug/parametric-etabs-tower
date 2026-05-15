# Parametric ETABS Tower Prototype

This project is a proof-of-concept showing how a browser-based Three.js parametric modeling interface can communicate with a local C# server that controls ETABS through the ETABS API.

The goal is to create parametric tower geometry in the browser, visualize it in 3D, and then send that same geometry into ETABS for quick structural studies.

---

# What This Project Does

This first version creates a simple single-story structural floor plate.

The user can define:

- Floor width
- Floor length
- Target column spacing
- First floor height

The Three.js frontend then creates:

- A rectangular floor plate
- Evenly spaced columns
- Beams between column grid lines
- A transparent slab/floor surface

When the user clicks **Make ETABS Model**, the same geometry is sent to a local C# backend. The C# backend then opens ETABS and creates the equivalent structural model using the ETABS API.

---

# Project Structure

```txt
parametric-etabs-tower/
├── src/
│   └── App.tsx
│
├── backend/
│   └── EtabsBridge/
│       ├── Program.cs
│       └── EtabsBridge.csproj
│
├── package.json
├── vite.config.ts
└── README.md

How the Architecture Works

This project has two separate pieces running at the same time:

The Three.js / React / TypeScript frontend
The C# / ASP.NET / ETABS API backend

These are two different programs.

The browser cannot directly talk to ETABS. ETABS is a Windows desktop application with a COM-based API. Because of that, the browser needs help from a local server-side application.

That is why this project uses a C# backend.

The flow is:

Three.js browser app
        |
        | HTTP POST request
        v
C# ASP.NET local backend
        |
        | ETABS API / COM
        v
ETABS desktop application
Why Two Localhost Addresses Are Needed

When developing this project, you need two local web addresses open/running:

1. Frontend: Three.js App
http://localhost:5173

This is the Vite development server.

This is the website you interact with. It shows the Three.js model, the input fields, and the Make ETABS Model button.

You start it with:

npm run dev
2. Backend: ETABS Bridge
http://localhost:5055

This is the local C# server.

This does not show the 3D model. It simply waits for requests from the frontend. When it receives geometry data, it uses the ETABS API to launch ETABS and create the model.

You start it with:

cd backend/EtabsBridge
dotnet run

If you open this address in a browser:

http://localhost:5055

you should see:

ETABS Bridge is running.

That means the backend server is ready.

Why the Browser Needs the C# Backend

Three.js runs in the browser. It is excellent for visualization, user input, and parametric geometry generation.

However, a browser cannot directly start ETABS or call the ETABS COM API. Browsers are sandboxed for security reasons. They cannot directly control installed desktop software.

C# can talk to ETABS because it can reference ETABSv1.dll and use the ETABS API.

So the browser sends a JSON message to C#, and C# talks to ETABS.

What Happens When You Click Make ETABS Model

When the user clicks Make ETABS Model, the frontend creates a geometry object like this:

{
  input: {
    widthFt: 120,
    lengthFt: 180,
    columnSpacingFt: 30,
    firstFloorHeightFt: 20
  },
  model: {
    columns: [...],
    beams: [...],
    floorCorners: [...]
  }
}

Then the frontend sends that data to the backend using:

fetch("http://localhost:5055/api/etabs/create-floor", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    input,
    model
  })
});

The backend receives the request at:

/api/etabs/create-floor

Then Program.cs uses the ETABS API to:

Start ETABS
Create a blank model
Define concrete material
Define column and beam sections
Add columns
Add beams
Refresh the ETABS view
Running the Project

You need two terminals.

Terminal 1: Start the ETABS Backend

From the project root:

cd backend/EtabsBridge
dotnet run

You should see:

Now listening on: http://localhost:5055

Leave this terminal running.

Terminal 2: Start the Three.js Frontend

From the project root:

npm run dev

You should see:

Local: http://localhost:5173

Open:

http://localhost:5173

Then click:

Make ETABS Model

ETABS should open and create the model.

Important ETABS API Setup

The C# project needs to reference the correct ETABS API DLL.

In EtabsBridge.csproj, the ETABS reference should point to your installed ETABS version:

<Reference Include="ETABSv1">
  <HintPath>C:\Program Files\Computers and Structures\ETABS 21\ETABSv1.dll</HintPath>
  <Private>true</Private>
  <EmbedInteropTypes>false</EmbedInteropTypes>
</Reference>

In Program.cs, the ETABS executable path should match the same version:

string etabsPath = @"C:\Program Files\Computers and Structures\ETABS 21\ETABS.exe";

These must match.

For example, do not reference the ETABS 21 DLL while launching ETABS 22. That can cause an API version error.

Current Limitations

This is only the first prototype.

Current limitations:

Only creates a single floor
No lateral system yet
No wall/core modeling yet
No load cases yet
No load combinations yet
No meshing controls yet
No tower tapering yet
Slab creation may need additional ETABS API refinement
ETABS paths are currently hardcoded
Future Goals

Planned next steps:

Add multiple stories
Add story-by-story floor plate changes
Add square-to-circle-to-square tower transitions
Add perimeter mega columns
Add external steel diagrid / exoskeleton
Add core walls
Add gravity loads
Add wind load studies
Add automatic ETABS analysis runs
Read results back from ETABS
Show drift, reactions, and member force results in Three.js
Conceptual Goal

The long-term goal is to use Three.js as a lightweight parametric structural modeling environment and ETABS as the structural analysis engine.

Three.js handles:

Geometry generation
Visualization
User interaction
Parametric controls

ETABS handles:

Structural object creation
Analysis
Design checks
Structural results

Together, this creates a workflow where structural engineers can quickly generate and study building forms without manually rebuilding geometry inside ETABS each time.