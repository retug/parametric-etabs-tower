using ETABSv1;
using System.Text.Json.Serialization;

var webBuilder = WebApplication.CreateBuilder(args);

webBuilder.Services.AddCors(options =>
{
    options.AddPolicy("AllowVite", policy =>
    {
        policy
            .WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = webBuilder.Build();

app.UseCors("AllowVite");

app.MapGet("/", () => "ETABS Bridge is running.");

app.MapPost("/api/etabs/create-tower", (CreateTowerRequest request) =>
{
    try
    {
        Console.WriteLine("Received tower model from Three.js");
        Console.WriteLine($"Floors: {request.Model.Floors.Count}");
        Console.WriteLine($"Internal columns: {request.Model.InternalColumns.Count}");
        Console.WriteLine($"Exterior columns: {request.Model.ExteriorColumns.Count}");
        Console.WriteLine($"Floor beams: {request.Model.FloorBeams.Count}");

        var etabsBuilder = new EtabsTowerBuilder();
        etabsBuilder.CreateTowerModel(request);

        return Results.Ok(new
        {
            message = "ETABS tower model created successfully.",
            floors = request.Model.Floors.Count,
            internalColumns = request.Model.InternalColumns.Count,
            exteriorColumns = request.Model.ExteriorColumns.Count,
            floorBeams = request.Model.FloorBeams.Count
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine(ex.ToString());
        return Results.Problem(ex.ToString());
    }
});

app.Run("http://localhost:5055");

public class CreateTowerRequest
{
    [JsonPropertyName("input")]
    public TowerInput Input { get; set; } = new();

    [JsonPropertyName("model")]
    public TowerModel Model { get; set; } = new();
}

public class TowerInput
{
    [JsonPropertyName("totalFloors")]
    public int TotalFloors { get; set; }

    [JsonPropertyName("widthFt")]
    public double WidthFt { get; set; }

    [JsonPropertyName("lengthFt")]
    public double LengthFt { get; set; }

    [JsonPropertyName("columnSpacingFt")]
    public double ColumnSpacingFt { get; set; }

    [JsonPropertyName("storyHeightFt")]
    public double StoryHeightFt { get; set; }

    [JsonPropertyName("neckingPercent")]
    public double NeckingPercent { get; set; }

    [JsonPropertyName("twistDegPerFloor")]
    public double TwistDegPerFloor { get; set; }
}

public class Point3
{
    [JsonPropertyName("x")]
    public double X { get; set; }

    [JsonPropertyName("y")]
    public double Y { get; set; }

    [JsonPropertyName("z")]
    public double Z { get; set; }
}

public class FloorPlate
{
    [JsonPropertyName("floor")]
    public int Floor { get; set; }

    [JsonPropertyName("elevation")]
    public double Elevation { get; set; }

    [JsonPropertyName("width")]
    public double Width { get; set; }

    [JsonPropertyName("length")]
    public double Length { get; set; }

    [JsonPropertyName("rotationDeg")]
    public double RotationDeg { get; set; }

    [JsonPropertyName("corners")]
    public List<Point3> Corners { get; set; } = new();

    [JsonPropertyName("perimeterPoints")]
    public List<Point3> PerimeterPoints { get; set; } = new();
}

public class TowerModel
{
    [JsonPropertyName("floors")]
    public List<FloorPlate> Floors { get; set; } = new();

    [JsonPropertyName("internalColumns")]
    public List<List<Point3>> InternalColumns { get; set; } = new();

    [JsonPropertyName("exteriorColumns")]
    public List<List<Point3>> ExteriorColumns { get; set; } = new();

    [JsonPropertyName("floorBeams")]
    public List<List<Point3>> FloorBeams { get; set; } = new();
}

public class EtabsTowerBuilder
{
    public void CreateTowerModel(CreateTowerRequest request)
    {
        string etabsPath = @"C:\Program Files\Computers and Structures\ETABS 23\ETABS.exe";

        Console.WriteLine("Starting ETABS...");
        Console.WriteLine(etabsPath);

        cHelper helper = new Helper();
        cOAPI etabsObject = helper.CreateObject(etabsPath);

        etabsObject.ApplicationStart();

        cSapModel sapModel = etabsObject.SapModel;

        sapModel.InitializeNewModel(eUnits.kip_ft_F);
        sapModel.File.NewBlank();

        Console.WriteLine("ETABS model initialized.");

        CreateMaterialsAndSections(sapModel);

        Console.WriteLine("Creating internal columns broken at every floor...");
        CreateInternalColumnsBrokenAtFloors(sapModel, request);

        Console.WriteLine("Creating exterior sloped columns...");
        CreateFrameSegments(
            sapModel,
            request.Model.ExteriorColumns,
            "EXTERIOR_COL_36x36",
            "ExteriorColumn"
        );

        Console.WriteLine("Creating perimeter beams...");
        CreateFrameSegments(
            sapModel,
            request.Model.FloorBeams,
            "BM_18x24",
            "FloorBeam"
        );

        Console.WriteLine("Creating floor plates...");
        CreateFloorPlates(sapModel, request);

        sapModel.View.RefreshView(0, false);

        Console.WriteLine("ETABS tower model creation complete.");
    }

    private void CreateMaterialsAndSections(cSapModel sapModel)
    {
        sapModel.PropMaterial.SetMaterial("CONC_6000", eMatType.Concrete);
        sapModel.PropMaterial.SetMPIsotropic("CONC_6000", 4400, 0.2, 0.0000055);

        sapModel.PropMaterial.SetMaterial("STEEL_A992", eMatType.Steel);
        sapModel.PropMaterial.SetMPIsotropic("STEEL_A992", 29000, 0.3, 0.0000065);

        sapModel.PropFrame.SetRectangle("INT_COL_30x30", "CONC_6000", 2.5, 2.5);
        sapModel.PropFrame.SetRectangle("EXTERIOR_COL_36x36", "STEEL_A992", 3.0, 3.0);
        sapModel.PropFrame.SetRectangle("BM_18x24", "STEEL_A992", 1.5, 2.0);

        sapModel.PropArea.SetSlab(
            "SLAB_8IN",
            eSlabType.Slab,
            eShellType.ShellThin,
            "CONC_6000",
            8.0 / 12.0
        );
    }

    private void CreateInternalColumnsBrokenAtFloors(
        cSapModel sapModel,
        CreateTowerRequest request
    )
    {
        int totalFloors = request.Input.TotalFloors;
        double storyHeight = request.Input.StoryHeightFt;

        foreach (var col in request.Model.InternalColumns)
        {
            if (col.Count < 2)
                continue;

            var basePt = col[0];

            for (int floor = 0; floor < totalFloors; floor++)
            {
                double z1 = floor * storyHeight;
                double z2 = (floor + 1) * storyHeight;

                string name = "";

                sapModel.FrameObj.AddByCoord(
                    basePt.X,
                    basePt.Y,
                    z1,
                    basePt.X,
                    basePt.Y,
                    z2,
                    ref name,
                    "INT_COL_30x30",
                    "Global"
                );
            }
        }
    }

    private void CreateFrameSegments(
        cSapModel sapModel,
        List<List<Point3>> segments,
        string sectionName,
        string userNamePrefix
    )
    {
        int count = 0;

        foreach (var segment in segments)
        {
            if (segment.Count < 2)
                continue;

            var a = segment[0];
            var b = segment[1];

            string name = $"{userNamePrefix}_{count}";

            sapModel.FrameObj.AddByCoord(
                a.X,
                a.Y,
                a.Z,
                b.X,
                b.Y,
                b.Z,
                ref name,
                sectionName,
                "Global"
            );

            count++;
        }
    }

    private void CreateFloorPlates(cSapModel sapModel, CreateTowerRequest request)
    {
        foreach (var floor in request.Model.Floors)
        {
            if (floor.Corners.Count < 4)
                continue;

            var corners = floor.Corners;

            double[] x =
            {
                corners[0].X,
                corners[1].X,
                corners[2].X,
                corners[3].X
            };

            double[] y =
            {
                corners[0].Y,
                corners[1].Y,
                corners[2].Y,
                corners[3].Y
            };

            double[] z =
            {
                corners[0].Z,
                corners[1].Z,
                corners[2].Z,
                corners[3].Z
            };

            string areaName = $"FloorPlate_{floor.Floor}";

            sapModel.AreaObj.AddByCoord(
                4,
                ref x,
                ref y,
                ref z,
                ref areaName,
                "SLAB_8IN",
                "Global"
            );
        }
    }
}