import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Link, ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import DataPreview from "@/components/DataPreview";
import TargetSelection from "@/components/TargetSelection";
import DataTypesDefinition from "@/components/DataTypesDefinition";
import TreeAttributes from "@/components/TreeAttributes";
import { CreateTreeStep, UploadMethod, TreeAttributes as TreeAttributesType, DataPreviewData } from "@/types";
import { apiService } from "@/services/api";

const CreateTree = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [uploadMethod, setUploadMethod] = useState<UploadMethod>("file");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<CreateTreeStep>("upload");
  const [selectedTarget, setSelectedTarget] = useState("");
  const [dataTypes, setDataTypes] = useState<Record<string, string>>({});
  const [uploadedData, setUploadedData] = useState<DataPreviewData | null>(null);
  const [isLoadingDataTypes, setIsLoadingDataTypes] = useState(false);
  const [treeAttributes, setTreeAttributes] = useState<TreeAttributesType>({
    maxDepth: "5",
    minNodeSplit: "500",
    minLeafSize: "100",
    maxBranches: "5",
    criteria: "entropy",
    uniqueVar: "0",
    monotonousSplits: "0"
  });

  // Set initial step based on URL parameter
  useEffect(() => {
    const step = searchParams.get('step') as CreateTreeStep;
    if (step && ["upload", "preview", "target", "datatypes", "attributes"].includes(step)) {
      setCurrentStep(step);
    }
  }, [searchParams]);

  // Handle imported CSV data from import tree flow
  useEffect(() => {
    const state = location.state as any;
    if (state?.isImported && state?.uploadedData) {
      console.log('Imported CSV data detected:', state.uploadedData);
      setUploadedData(state.uploadedData);
      setCurrentStep("preview");
    }
  }, [location.state]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file type and size
      if (!file.name.endsWith(".csv")) {
        toast({
          title: "Invalid File Type",
          description: "Please select a CSV file.",
          variant: "destructive",
        });
        return;
      }
      
      // Check file size (limit to 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        toast({
          title: "File Too Large",
          description: "Please select a CSV file smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedFile(file);
      setFileUrl(""); // Clear URL when file is selected
      
      toast({
        title: "File Selected",
        description: `${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
      });
    }
  };

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const url = event.target.value;
    setFileUrl(url);
    setSelectedFile(null); // Clear file when URL is entered
    
    // Basic URL validation
    if (url && !url.match(/^https?:\/\/.+/)) {
      // Don't show error immediately, let user finish typing
      // We'll validate on submit
    }
  };

  const handleImport = async () => {
    if (!selectedFile && !fileUrl) {
      toast({
        title: "No Data Source",
        description: "Please select a file or enter a URL.",
        variant: "destructive",
      });
      return;
    }

    // Validate URL if provided
    if (fileUrl && !fileUrl.match(/^https?:\/\/.+/)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL starting with http:// or https://",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Determine what to send to the API
      const fileToUpload = selectedFile || fileUrl;
      
      console.log('Attempting to upload:', fileToUpload);
      console.log('Selected file:', selectedFile);
      console.log('File URL:', fileUrl);
      
      // Call the /api/upload endpoint using the API service
      const data = await apiService.uploadFile(fileToUpload);
      
      console.log('API response received:', data);
      
      // Transform the API response to match our DataPreviewData interface
      const transformedData: DataPreviewData = {
        rows: data.rows,
        columns: data.columns,
        columnNames: data.columnsList,
        sampleData: data.sample
      };
      
      // Store the uploaded data
      setUploadedData(transformedData);
      
      toast({
        title: "Import Successful",
        description: `Data imported from ${selectedFile ? selectedFile.name : "URL"}.`,
      });
      
      // Move to preview step
      setCurrentStep("preview");
    } catch (error) {
      console.error('Upload error details:', error);
      console.error('Error type:', typeof error);
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
      
      let errorMessage = "There was an error importing your data. Please check your file or URL and try again.";
      
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          errorMessage = "Cannot connect to the server. Please make sure the backend is running.";
        } else if (error.message.includes('404')) {
          errorMessage = "API endpoint not found. Please check if the backend is properly configured.";
        } else if (error.message.includes('500')) {
          errorMessage = "Server error occurred. Please try again later.";
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      }
      
      toast({
        title: "Import Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTargetChange = (value: string) => {
    setSelectedTarget(value);
  };

  const handleDataTypeChange = (column: string, type: string) => {
    setDataTypes(prev => ({ ...prev, [column]: type }));
  };

  const handleBulkDataTypeChange = (columns: string[], type: string) => {
    setDataTypes(prev => {
      const updated = { ...prev };
      columns.forEach(column => {
        updated[column] = type;
      });
      return updated;
    });
  };

  const handleAttributeChange = (key: string, value: string) => {
    setTreeAttributes(prev => ({ ...prev, [key]: value }));
  };

  // Helper function to safely convert string to number with fallback
  const safeParseInt = (value: string, fallback: number): number => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  };

  const handleNext = async () => {
    if (currentStep === "preview") {
      setCurrentStep("target");
    } else if (currentStep === "target") {
      if (!selectedTarget) {
        toast({
          title: "Target Variable Required",
          description: "Please select a target variable from the dropdown to continue.",
          variant: "destructive",
        });
        return;
      }
      
      // Call /api/setTarget when moving to data types step
      setIsLoading(true);
      try {
        await apiService.setTarget(selectedTarget);
        console.log('Target variable set successfully:', selectedTarget);
        
        toast({
          title: "Target Variable Set",
          description: `Target variable "${selectedTarget}" has been configured successfully.`,
        });
      } catch (error) {
        console.error('Error setting target variable:', error);
        toast({
          title: "Error Setting Target",
          description: "Failed to set target variable. Please try again.",
          variant: "destructive",
        });
        return;
      } finally {
        setIsLoading(false);
      }
      
      // Load data types from API
      setIsLoadingDataTypes(true);
      try {
        const typesFromAPI = await apiService.getTypes();
        console.log('Data types from API:', typesFromAPI);
        
        // Update data types with API response
        setDataTypes(typesFromAPI);
        
        toast({
          title: "Data Types Loaded",
          description: "Variable types have been automatically detected from your data.",
        });
      } catch (error) {
        console.error('Error loading data types:', error);
        toast({
          title: "Warning",
          description: "Could not load data types from server. Using defaults.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingDataTypes(false);
      }
      
      setCurrentStep("datatypes");
    } else if (currentStep === "datatypes") {
      // Call /api/keepVar when moving to attributes step
      setIsLoading(true);
      try {
        const result = await apiService.keepVariables(dataTypes);
        console.log('Variables kept successfully:', result);
        
        toast({
          title: "Data Types Saved",
          description: "Variable types have been configured successfully.",
        });
        
        setCurrentStep("attributes");
      } catch (error) {
        console.error('Error saving data types:', error);
        toast({
          title: "Error Saving Data Types",
          description: "Failed to save data types. Please try again.",
          variant: "destructive",
        });
        return;
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSkipToInteractive = async () => {
    setIsLoading(true);
    
    try {
      // Call /api/defineHP first
      const hyperparameters = {
        max_depth: safeParseInt(treeAttributes.maxDepth, 5),
        min_node_split: safeParseInt(treeAttributes.minNodeSplit, 500),
        min_leaf_size: safeParseInt(treeAttributes.minLeafSize, 100),
        max_branches: safeParseInt(treeAttributes.maxBranches, 5),
        criteria: treeAttributes.criteria,
        unique_var: safeParseInt(treeAttributes.uniqueVar, 0),
        monotonous: safeParseInt(treeAttributes.monotonousSplits, 0)
      };
      
      console.log('Sending hyperparameters to API:', hyperparameters);
      await apiService.defineHyperparameters(hyperparameters);
      
      console.log('Hyperparameters defined successfully');
      
      // Then call /api/initTree
      const initResult = await apiService.initTree();
      console.log('Tree initialized successfully:', initResult);
      
      toast({
        title: "Tree Initialized",
        description: "Decision tree has been initialized. You can now build it interactively.",
      });
      
      // Navigate to tree visualization
      navigate("/tree-visualization");
      
    } catch (error) {
      console.error('Error initializing tree:', error);
      toast({
        title: "Error Initializing Tree",
        description: "Failed to initialize the decision tree. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBuildTree = async () => {
    setIsLoading(true);
    
    try {
      // Call /api/defineHP first
      const hyperparameters = {
        max_depth: safeParseInt(treeAttributes.maxDepth, 5),
        min_node_split: safeParseInt(treeAttributes.minNodeSplit, 500),
        min_leaf_size: safeParseInt(treeAttributes.minLeafSize, 100),
        max_branches: safeParseInt(treeAttributes.maxBranches, 5),
        criteria: treeAttributes.criteria,
        unique_var: safeParseInt(treeAttributes.uniqueVar, 0),
        monotonous: safeParseInt(treeAttributes.monotonousSplits, 0)
      };
      
      console.log('Sending hyperparameters to API:', hyperparameters);
      await apiService.defineHyperparameters(hyperparameters);
      
      console.log('Hyperparameters defined successfully');
      
      // Then call /api/initTree
      await apiService.initTree();
      console.log('Tree initialized successfully');
      
      // Finally call /api/autoTree
      const autoTreeResult = await apiService.autoTree();
      console.log('Auto tree built successfully:', autoTreeResult);
      
      toast({
        title: "Decision Tree Built",
        description: "Your decision tree has been built automatically with the specified parameters.",
      });
      
      // Navigate to tree visualization
      navigate("/tree-visualization");
      
    } catch (error) {
      console.error('Error building tree:', error);
      toast({
        title: "Error Building Tree",
        description: "Failed to build the decision tree. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (currentStep === "target") {
      setCurrentStep("preview");
    } else if (currentStep === "datatypes") {
      setCurrentStep("target");
    } else if (currentStep === "attributes") {
      setCurrentStep("datatypes");
    } else if (currentStep === "preview") {
      setCurrentStep("upload");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Navigation Header */}
        <div className="flex justify-end items-center mb-8">
        </div>

        <div className="space-y-8">
          {currentStep === "upload" && (
            <Card className="shadow-card border-0 animate-fade-in">
              <CardHeader>
                <CardTitle className="text-center">Import Data Source</CardTitle>
                <CardDescription className="text-center">
                  Choose how you'd like to import your CSV data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Method Selection */}
                <div className="flex gap-4">
                  <Button
                    variant={uploadMethod === "file" ? "default" : "outline"}
                    onClick={() => setUploadMethod("file")}
                    className="flex-1"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload File
                  </Button>
                  <Button
                    variant={uploadMethod === "url" ? "default" : "outline"}
                    onClick={() => setUploadMethod("url")}
                    className="flex-1"
                  >
                    <Link className="h-4 w-4 mr-2" />
                    From URL
                  </Button>
                </div>

                {/* File Upload Option */}
                {uploadMethod === "file" && (
                  <div className="space-y-4">
                    <Label htmlFor="file-upload" className="text-sm font-medium">
                      Select CSV File
                    </Label>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <input
                        id="file-upload"
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <Label
                        htmlFor="file-upload"
                        className="cursor-pointer text-primary hover:text-primary/80"
                      >
                        Click to browse files
                      </Label>
                      <p className="text-sm text-muted-foreground mt-2">
                        Only CSV files are supported
                      </p>
                      {selectedFile && (
                        <div className="mt-4 p-2 border border-border rounded bg-accent/10">
                          <p className="text-sm font-medium">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* URL Input Option */}
                {uploadMethod === "url" && (
                  <div className="space-y-4">
                    <Label htmlFor="file-url" className="text-sm font-medium">
                      CSV File URL
                    </Label>
                    <Input
                      id="file-url"
                      type="url"
                      placeholder="https://example.com/data.csv"
                      value={fileUrl}
                      onChange={handleUrlChange}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      Enter the direct URL to your CSV file
                    </p>
                  </div>
                )}

                {/* Import Button */}
                <Button
                  onClick={handleImport}
                  disabled={isLoading || (!selectedFile && !fileUrl)}
                  className="w-full h-11 bg-gradient-primary hover:shadow-elegant transition-all duration-300"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import Data
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {currentStep === "preview" && (
            uploadedData ? (
              <DataPreview
                rows={uploadedData.rows}
                columns={uploadedData.columns}
                sampleData={uploadedData.sampleData}
                columnNames={uploadedData.columnNames}
              />
            ) : (
              <Card className="shadow-card border-0">
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">No data available. Please upload a file first.</p>
                </CardContent>
              </Card>
            )
          )}

          {currentStep === "target" && (
            uploadedData ? (
              <TargetSelection
                columnNames={uploadedData.columnNames}
                selectedTarget={selectedTarget}
                onTargetChange={handleTargetChange}
              />
            ) : (
              <Card className="shadow-card border-0">
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">No data available. Please upload a file first.</p>
                </CardContent>
              </Card>
            )
          )}

          {currentStep === "datatypes" && (
            uploadedData ? (
              <DataTypesDefinition
                columnNames={uploadedData.columnNames}
                selectedTarget={selectedTarget}
                dataTypes={dataTypes}
                onDataTypeChange={handleDataTypeChange}
                onBulkDataTypeChange={handleBulkDataTypeChange}
                isLoading={isLoadingDataTypes}
              />
            ) : (
              <Card className="shadow-card border-0">
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">No data available. Please upload a file first.</p>
                </CardContent>
              </Card>
            )
          )}

          {currentStep === "attributes" && (
            <TreeAttributes
              attributes={treeAttributes}
              onAttributeChange={handleAttributeChange}
            />
          )}

          {/* Navigation Buttons */}
          {currentStep !== "upload" && (
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={handleBack}
                className="px-6"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              
              {currentStep !== "attributes" ? (
                <Button
                  onClick={handleNext}
                  disabled={isLoading}
                  className="px-6 bg-gradient-primary hover:shadow-elegant transition-all duration-300"
                >
                  {isLoading ? "Loading..." : "Next"}
                </Button>
              ) : (
                <div className="flex gap-3">
                  <Button
                    onClick={handleSkipToInteractive}
                    disabled={isLoading}
                    variant="outline"
                    className="px-6 border-border hover:bg-muted transition-all duration-300"
                  >
                    {isLoading ? "Loading..." : "Skip to Build Interactive"}
                  </Button>
                  <Button
                    onClick={handleBuildTree}
                    disabled={isLoading}
                    className="px-6 bg-gradient-primary hover:shadow-elegant transition-all duration-300"
                  >
                    {isLoading ? "Building..." : "Build Decision Tree"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CreateTree;