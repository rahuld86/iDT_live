import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Download, Cloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type ExportMethod = "download" | "s3";

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (method: ExportMethod, s3Path?: string) => void;
  defaultFilename: string;
  fileExtension: string;
  isLoading?: boolean;
}

const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  onExport,
  defaultFilename,
  fileExtension,
  isLoading = false,
}) => {
  const [exportMethod, setExportMethod] = useState<ExportMethod>("download");
  const [s3Path, setS3Path] = useState("");
  const { toast } = useToast();

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      // Dialog just opened, reset to defaults
      setExportMethod("download");
      setS3Path("");
    }
  }, [isOpen]);

  const handleExport = () => {
    if (exportMethod === "s3") {
      if (!s3Path.trim()) {
        toast({
          title: "S3 Path Required",
          description: "Please enter an S3 bucket path (e.g., s3://bucket-name/path/to/folder)",
          variant: "destructive",
        });
        return;
      }
      
      // Validate S3 path format
      let finalS3Path = s3Path.trim();
      if (!finalS3Path.match(/^s3:\/\/.+/)) {
        toast({
          title: "Invalid S3 Path",
          description: "S3 path must start with s3:// (e.g., s3://bucket-name/path/to/folder)",
          variant: "destructive",
        });
        return;
      }
      
      // If path doesn't end with a file extension, append default filename
      // Check if it ends with a common file extension (e.g., .json, .py, .sql, .csv, .jpg)
      const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(finalS3Path);
      if (!hasFileExtension) {
        // Ensure path ends with / if it's a directory
        if (!finalS3Path.endsWith('/')) {
          finalS3Path += '/';
        }
        // Append default filename with extension
        const filename = defaultFilename.includes('.') ? defaultFilename : `${defaultFilename}.${fileExtension}`;
        finalS3Path += filename;
      }
      
      onExport(exportMethod, finalS3Path);
    } else {
      onExport(exportMethod, undefined);
    }
  };

  const handleClose = () => {
    if (isLoading) return; // Prevent closing while exporting
    setExportMethod("download");
    setS3Path("");
    onClose();
  };

  // Generate suggested S3 path (bucket/path, without filename - filename will be appended if not provided)
  const suggestedS3Path = `s3://my-bucket/path/to/folder/`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !isLoading) {
        handleClose();
      }
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export {defaultFilename}
          </DialogTitle>
          <DialogDescription>
            Choose how you'd like to export the file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Export Method Selection */}
          <RadioGroup value={exportMethod} onValueChange={(value) => setExportMethod(value as ExportMethod)}>
            <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-accent/50 cursor-pointer">
              <RadioGroupItem value="download" id="download" />
              <Label htmlFor="download" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  <div>
                    <div className="font-medium">Download to Local Machine</div>
                    <div className="text-sm text-muted-foreground">
                      Save file to your computer ({defaultFilename})
                    </div>
                  </div>
                </div>
              </Label>
            </div>

            <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-accent/50 cursor-pointer">
              <RadioGroupItem value="s3" id="s3" />
              <Label htmlFor="s3" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Cloud className="h-4 w-4" />
                  <div>
                    <div className="font-medium">Upload to S3 Bucket</div>
                    <div className="text-sm text-muted-foreground">
                      Save file directly to your S3 bucket
                    </div>
                  </div>
                </div>
              </Label>
            </div>
          </RadioGroup>

          {/* S3 Path Input */}
          {exportMethod === "s3" && (
            <div className="space-y-4">
              <Label htmlFor="s3-path" className="text-sm font-medium">
                S3 Path
              </Label>
              <Input
                id="s3-path"
                type="text"
                placeholder={suggestedS3Path}
                value={s3Path}
                onChange={(e) => setS3Path(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Enter the S3 bucket path (e.g., s3://bucket-name/path/to/folder). 
                {defaultFilename && ` File will be saved as "${defaultFilename}.${fileExtension}" if no filename is specified.`}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isLoading}>
            {isLoading ? "Exporting..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;

