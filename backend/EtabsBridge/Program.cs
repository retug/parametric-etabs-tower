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

app.MapPost("/api/etabs/create-floor", (CreateFloorRequest request) =>
{
    try
    {
        Console.WriteLine("Received model from Three.js");
        Console.WriteLine($"Columns: {request.Model.Columns.Count}");
        Console.WriteLine($"Beams: {request.Model.Beams.Count}");

        var etabsBuilder = new EtabsModelBuilder();
        etabsBuilder.CreateSingleFloorModel(request);

        return Results.Ok(new
        {
            message = "ETABS model created successfully.",
            columns = request.Model.Columns.Count,
            beams = request.Model.Beams.Count
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine(ex.ToString());
        return Results.Problem(ex.ToString());
    }
});

app.Run("http://localhost:5055");

public class CreateFloorRequest
{
    [JsonPropertyName("input")]
    public FloorPlateInput Input { get; set; } = new();

    [JsonPropertyName("model")]
    public FloorPlateModel Model { get; set; } = new();
}

public class FloorPlateInput
{
    [JsonPropertyName("widthFt")]
    public double WidthFt { get; set; }

    [JsonPropertyName("lengthFt")]
    public double LengthFt { get; set; }

    [JsonPropertyName("columnSpacingFt")]
    public double ColumnSpacingFt { get; set; }

    [JsonPropertyName("firstFloorHeightFt")]
    public double FirstFloorHeightFt { get; set; }
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

public class FloorPlateModel
{
    [JsonPropertyName("columns")]
    public List<Point3> Columns { get; set; } = new();

    [JsonPropertyName("beams")]
    public List<List<Point3>> Beams { get; set; } = new();

    [JsonPropertyName("floorCorners")]
    public List<Point3> FloorCorners { get; set; } = new();
}

public class EtabsModelBuilder
{
    public void CreateSingleFloorModel(CreateFloorRequest request)
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

        sapModel.PropMaterial.SetMaterial("CONC_4000", eMatType.Concrete);
        sapModel.PropMaterial.SetMPIsotropic("CONC_4000", 3600, 0.2, 0.0000055);

        sapModel.PropFrame.SetRectangle("COL_24x24", "CONC_4000", 2.0, 2.0);
        sapModel.PropFrame.SetRectangle("BM_18x24", "CONC_4000", 1.5, 2.0);

        double h = request.Input.FirstFloorHeightFt;

        Console.WriteLine("Creating columns...");

        foreach (var col in request.Model.Columns)
        {
            string name = "";

            sapModel.FrameObj.AddByCoord(
                col.X, col.Y, 0,
                col.X, col.Y, h,
                ref name,
                "COL_24x24",
                "Global"
            );
        }

        Console.WriteLine("Creating beams...");

        foreach (var beam in request.Model.Beams)
        {
            if (beam.Count < 2)
                continue;

            var a = beam[0];
            var b = beam[1];

            string name = "";

            sapModel.FrameObj.AddByCoord(
                a.X, a.Y, a.Z,
                b.X, b.Y, b.Z,
                ref name,
                "BM_18x24",
                "Global"
            );
        }

        sapModel.View.RefreshView(0, false);

        Console.WriteLine("ETABS model creation complete.");
    }
}