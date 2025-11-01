import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Plus, BarChart3 } from "lucide-react";
import { RedBoxLogo } from "@/components/RedBoxLogo";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import ImportTreeDialog from "@/components/ImportTreeDialog";
import { apiService } from "@/services/api";
import { authService } from "@/services/authService";
import { useToast } from "@/hooks/use-toast";

const Dashboard = () => {
  const navigate = useNavigate();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const { toast } = useToast();

  const handleCreateNew = () => {
    navigate("/create-tree");
  };

  const handleImport = () => {
    setShowImportDialog(true);
  };

  const handleImportTree = async (file: File | string) => {
    try {
      // Call the API to import the tree
      const response = await apiService.importTree(file);
      
      // Close the dialog
      setShowImportDialog(false);
      
      // Check if this is a CSV import (raw data)
      if (response.is_csv_import) {
        // For CSV files, navigate to create tree flow with the uploaded data
        navigate("/create-tree", { 
          state: { 
            uploadedData: {
              rows: response.rows,
              columns: response.columns,
              columnNames: response.columnsList,
              sampleData: response.sample
            },
            isImported: true 
          } 
        });
        
        toast({
          title: "Success",
          description: "CSV data imported successfully!",
        });
      } else {
        // For JSON files, navigate directly to tree visualization
        navigate("/tree-visualization", { 
          state: { 
            importedData: response.node_master,
            isImported: true 
          } 
        });
        
        toast({
          title: "Success",
          description: "Tree imported successfully!",
        });
      }
      
    } catch (error) {
      console.error('Error importing tree:', error);
      toast({
        title: "Import Error",
        description: "Failed to import tree. Please check the file and try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <RedBoxLogo size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Decision Tree Builder</h1>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => {
                authService.logout();
                navigate("/");
              }}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Welcome to Your Decision Tree Workspace
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose how you'd like to get started with building your decision tree. 
            Create a new tree from scratch or import an existing one to continue your work.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Create New Decision Tree */}
          <Card className="shadow-card border-0 group hover:shadow-elegant transition-all duration-300 cursor-pointer animate-fade-in">
            <CardHeader className="text-center pb-6">
              <div className="mx-auto mb-4 h-16 w-16 rounded-xl bg-gradient-primary flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Plus className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-xl font-semibold text-foreground">
                Create a New Decision Tree
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Start building your decision tree from scratch with our intuitive drag-and-drop interface
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button 
                onClick={handleCreateNew}
                className="w-full h-11 bg-gradient-primary hover:shadow-elegant transition-all duration-300"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create New Tree
              </Button>
            </CardContent>
          </Card>

          {/* Import Existing Decision Tree */}
          <Card className="shadow-card border-0 group hover:shadow-elegant transition-all duration-300 cursor-pointer animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <CardHeader className="text-center pb-6">
              <div className="mx-auto mb-4 h-16 w-16 rounded-xl bg-accent flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Upload className="h-8 w-8 text-accent-foreground" />
              </div>
              <CardTitle className="text-xl font-semibold text-foreground">
                Import an Existing Decision Tree
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Upload and continue working on decision trees from JSON format
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button 
                onClick={handleImport}
                variant="outline"
                className="w-full h-11 border-2 hover:bg-accent/10 transition-all duration-300"
              >
                <Upload className="mr-2 h-4 w-4" />
                Import Tree
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Import Tree Dialog */}
      <ImportTreeDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={handleImportTree}
      />
    </div>
  );
};

export default Dashboard;