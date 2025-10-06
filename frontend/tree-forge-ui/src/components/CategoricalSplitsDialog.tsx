import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { apiService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import EditCategoricalBinsDialog from './EditCategoricalBinsDialog';

interface CategoricalSplitData {
  all_records: number;
  event_rate: number;
  events: number;
  list_values: string[];
  lower_bound: number;
  missing: boolean;
  upper_bound: number;
  variable: string;
}

interface CategoricalBinData {
  bin_number: number;
  values: string[];
  events: number;
  event_rate: number;
  all_records: number;
  hasMissing?: boolean;
}

interface CategoricalSplitsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  nodeNumber: number;
  variableName: string;
  onSplit: (selectedVariable: string) => void;
}

const CategoricalSplitsDialog: React.FC<CategoricalSplitsDialogProps> = ({
  isOpen,
  onClose,
  nodeNumber,
  variableName,
  onSplit,
}) => {
  const [categoricalBins, setCategoricalBins] = useState<CategoricalBinData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [editBinsDialog, setEditBinsDialog] = useState<{
    isOpen: boolean;
    binIndex: number;
  }>({
    isOpen: false,
    binIndex: 0
  });
  const { toast } = useToast();

  // Fetch best splits when dialog opens
  useEffect(() => {
    if (isOpen && nodeNumber && variableName) {
      fetchCategoricalSplits();
    }
  }, [isOpen, nodeNumber, variableName]);

  const fetchCategoricalSplits = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.bestSplit(nodeNumber, variableName);
      
      // Transform the response into categorical bin format
      const bins: CategoricalBinData[] = response.best_split.map((split: CategoricalSplitData, index: number) => {
        const binValues = Array.isArray(split.list_values) ? [...split.list_values] : [String(split.list_values)];
        
        // Add "Missing" to the values if this bin has missing=1
        if (split.missing) {
          binValues.push('Missing');
        }
        
        return {
          bin_number: index + 1,
          values: binValues,
          events: split.events,
          event_rate: split.event_rate,
          all_records: split.all_records,
          hasMissing: split.missing
        };
      });
      
      setCategoricalBins(bins);
      
    } catch (error) {
      console.error('Error fetching categorical splits:', error);
      toast({
        title: "Error",
        description: "Failed to fetch categorical splits. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBinNumberChange = (index: number, newBinNumber: number) => {
    if (newBinNumber < 1 || newBinNumber > categoricalBins.length) {
      toast({
        title: "Invalid Bin Number",
        description: `Bin number must be between 1 and ${categoricalBins.length}`,
        variant: "destructive",
      });
      return;
    }

    setCategoricalBins(prev => {
      const newBins = [...prev];
      newBins[index] = { ...newBins[index], bin_number: newBinNumber };
      
      // Sort bins by bin_number to maintain order
      newBins.sort((a, b) => a.bin_number - b.bin_number);
      
      return newBins;
    });
  };

  const handleSubmit = async () => {
    try {
      console.log('Submitting categorical force split:', categoricalBins);
      
      // First, delete any existing subtree
      console.log('Calling /api/delSubTree...');
      await apiService.delSubTree(nodeNumber);
      console.log('delSubTree completed');
      
      // Prepare the splits data for the API call
      const splitsForAPI = categoricalBins.map((bin, index) => {
        // Separate Missing from other values
        const hasMissing = bin.values.includes('Missing');
        const listValues = bin.values.filter(value => value !== 'Missing');
        
        return {
          lower_bound: bin.bin_number - 1, // Convert to 0-based indexing
          upper_bound: bin.bin_number,
          list_values: listValues,
          missing: hasMissing ? 1 : 0
        };
      });
      
      // Call the addNode API
      console.log('Calling /api/addNode...');
      const response = await apiService.addNode(nodeNumber, variableName, splitsForAPI);
      
      if (response.success) {
        toast({
          title: "Success",
          description: "Categorical force split applied successfully!",
        });
        
        // Close the dialog and trigger tree refresh
        onSplit(variableName);
        onClose();
      } else {
        toast({
          title: "Error",
          description: response.message || "Failed to apply categorical force split.",
          variant: "destructive",
        });
      }
      
    } catch (error) {
      console.error('Error applying categorical force split:', error);
      toast({
        title: "Error",
        description: "Failed to apply categorical force split. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    onClose();
  };

  const handleEditBins = (binIndex: number) => {
    setEditBinsDialog({
      isOpen: true,
      binIndex
    });
  };

  const handleEditBinsDialogClose = () => {
    setEditBinsDialog({
      isOpen: false,
      binIndex: 0
    });
  };

  const handleBinsUpdated = (updatedBins: CategoricalBinData[]) => {
    setCategoricalBins(updatedBins);
    toast({
      title: "Bins Updated",
      description: "Categorical bins have been successfully reorganized.",
    });
  };

  const formatEventRate = (rate: number) => {
    return (rate * 100).toFixed(1) + '%';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1000px] max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Categorical Splits - {variableName}</DialogTitle>
          <DialogDescription>
            Review and modify the categorical splits for {variableName} at Node {nodeNumber}. 
            Each bin contains specific categorical values with their event statistics.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-hidden min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="ml-2 text-muted-foreground">Loading categorical splits...</span>
            </div>
          ) : categoricalBins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No categorical splits available.
            </div>
          ) : (
            <div className="h-full max-h-[400px] overflow-y-auto border rounded-lg">
              {/* Table Header */}
              <div className="sticky top-0 bg-background border-b z-10">
                <div className="grid grid-cols-11 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
                  <div className="col-span-1 text-center">Bin #</div>
                  <div className="col-span-5">Values</div>
                  <div className="col-span-2 text-right"># of Events</div>
                  <div className="col-span-2 text-right">Event Rate</div>
                  <div className="col-span-1 text-center">Actions</div>
                </div>
              </div>
              
              {/* Table Rows */}
              <div className="divide-y">
                {categoricalBins.map((bin, index) => (
                  <div key={index} className="grid grid-cols-11 gap-2 px-3 py-3 hover:bg-accent/30 transition-colors">
                    {/* Bin Number (Editable) */}
                    <div className="col-span-1 flex items-center justify-center">
                      <Input
                        type="number"
                        min="1"
                        max={categoricalBins.length}
                        value={bin.bin_number}
                        onChange={(e) => handleBinNumberChange(index, parseInt(e.target.value) || 1)}
                        className="h-7 text-xs text-center w-12"
                      />
                    </div>
                    
                    {/* Values */}
                    <div className="col-span-5">
                      <div className="flex flex-wrap gap-1">
                        {bin.values.map((value, valueIndex) => (
                          <Badge 
                            key={valueIndex} 
                            variant="secondary" 
                            className="text-xs px-2 py-1"
                          >
                            {value}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    {/* # of Events */}
                    <div className="col-span-2 flex items-center justify-end">
                      {isEvaluating ? (
                        <div className="animate-pulse bg-muted h-5 w-12 rounded"></div>
                      ) : (
                        <span className="text-xs font-mono">
                          {bin.events.toLocaleString()}
                        </span>
                      )}
                    </div>
                    
                    {/* Event Rate */}
                    <div className="col-span-2 flex items-center justify-end">
                      {isEvaluating ? (
                        <div className="animate-pulse bg-muted h-5 w-10 rounded"></div>
                      ) : (
                        <Badge 
                          variant={bin.event_rate > 0.5 ? "default" : "outline"}
                          className="text-xs h-5 px-2"
                        >
                          {formatEventRate(bin.event_rate)}
                        </Badge>
                      )}
                    </div>
                    
                    
                    {/* Actions */}
                    <div className="col-span-1 flex items-center justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => handleEditBins(index)}
                        title="Edit bins and move values between them"
                      >
                        ✏️
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isLoading || categoricalBins.length === 0}
          >
            Apply Categorical Split
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Edit Bins Dialog */}
      <EditCategoricalBinsDialog
        isOpen={editBinsDialog.isOpen}
        onClose={handleEditBinsDialogClose}
        bins={categoricalBins}
        onSave={handleBinsUpdated}
        nodeNumber={nodeNumber}
        variableName={variableName}
      />
    </Dialog>
  );
};

export default CategoricalSplitsDialog;
