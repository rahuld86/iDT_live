import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Link, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type UploadMethod = "file" | "url";

interface ImportTreeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File | string) => void;
}

const ImportTreeDialog: React.FC<ImportTreeDialogProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [uploadMethod, setUploadMethod] = useState<UploadMethod>("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type - accept both JSON and CSV files
      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith('.json') && !fileName.endsWith('.csv')) {
        toast({
          title: "Invalid File Type",
          description: "Please select a JSON or CSV file.",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    try {
      setIsLoading(true);
      
      if (uploadMethod === "file") {
        if (!selectedFile) {
          toast({
            title: "No File Selected",
            description: "Please select a JSON or CSV file to import.",
            variant: "destructive",
          });
          return;
        }
        // Pass the actual File object
        onImport(selectedFile);
      } else {
        if (!fileUrl.trim()) {
          toast({
            title: "No URL Provided",
            description: "Please enter a URL to import from.",
            variant: "destructive",
          });
          return;
        }
        // Pass the URL string
        onImport(fileUrl.trim());
      }
      
    } catch (error) {
      console.error('Error during import:', error);
      toast({
        title: "Import Error",
        description: "Failed to import tree. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setFileUrl("");
    setUploadMethod("file");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Import Decision Tree
          </DialogTitle>
          <DialogDescription>
            Upload a JSON file containing your decision tree data or a CSV file with raw data to continue working on it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
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
                Select File
              </Label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <input
                  id="file-upload"
                  type="file"
                  accept=".json,.csv"
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
                  JSON and CSV files are supported
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

          {/* URL Option */}
          {uploadMethod === "url" && (
            <div className="space-y-4">
              <Label htmlFor="file-url" className="text-sm font-medium">
                Enter File URL or S3 Path
              </Label>
              <Input
                id="file-url"
                type="text"
                placeholder="https://example.com/file.csv or s3://bucket-name/path/to/file.csv"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Enter the URL (http:// or https://) or S3 path (s3://) of a JSON or CSV file containing your decision tree data or raw data.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={isLoading}>
            {isLoading ? "Importing..." : "Import Tree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportTreeDialog;
