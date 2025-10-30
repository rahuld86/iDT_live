import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { apiService } from '@/services/api';

interface CategoricalBin {
  bin_number: number;
  values: string[];
  events: number;
  event_rate: number;
  all_records: number;
  hasMissing?: boolean;
}

interface EditCategoricalBinsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  bins: CategoricalBin[];
  onSave: (updatedBins: CategoricalBin[]) => void;
  nodeNumber: number;
  variableName: string;
}

const EditCategoricalBinsDialog: React.FC<EditCategoricalBinsDialogProps> = ({
  isOpen,
  onClose,
  bins,
  onSave,
  nodeNumber,
  variableName,
}) => {
  const [editedBins, setEditedBins] = useState<CategoricalBin[]>([]);
  const [draggedValue, setDraggedValue] = useState<{ value: string; sourceBinIndex: number } | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const { toast } = useToast();
  const [regressionFlag, setRegressionFlag] = useState<number>(0);

  // Initialize edited bins when dialog opens
  useEffect(() => {
    if (isOpen) {
      setEditedBins([...bins]);
      // Load regression flag to control labels/formatting
      apiService.getRegressionFlag()
        .then((res) => setRegressionFlag(res?.regression_flag ?? 0))
        .catch(() => setRegressionFlag(0));
    }
  }, [isOpen, bins]);

  // Function to evaluate splits and update statistics
  const evaluateSplits = async (binsToEvaluate: CategoricalBin[]) => {
    try {
      setIsEvaluating(true);
      
      // Prepare the splits data for the API call
      const splitsForAPI = binsToEvaluate.map((bin) => {
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
      
      const response = await apiService.evalSplit(nodeNumber, variableName, splitsForAPI);
      
      // Update the bins with new evaluation data
      const updatedBins = binsToEvaluate.map((bin, index) => ({
        ...bin,
        events: response.eval_split[index]?.events || 0,
        event_rate: response.eval_split[index]?.event_rate || 0,
        all_records: response.eval_split[index]?.all_records || 0
      }));
      
      setEditedBins(updatedBins);
    } catch (error) {
      console.error('Error evaluating splits:', error);
      toast({
        title: "Evaluation Error",
        description: "Failed to update statistics. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleAddNewBin = () => {
    const newBinNumber = editedBins.length + 1;
    const newBin: CategoricalBin = {
      bin_number: newBinNumber,
      values: [],
      events: 0,
      event_rate: 0,
      all_records: 0
    };
    
    setEditedBins(prev => [...prev, newBin]);
  };

  const renumberBins = (bins: CategoricalBin[]): CategoricalBin[] => {
    return bins.map((bin, index) => ({
      ...bin,
      bin_number: index + 1
    }));
  };

  const handleRemoveBin = (binIndex: number) => {
    if (editedBins.length <= 1) {
      toast({
        title: "Cannot Remove Bin",
        description: "At least one bin must remain.",
        variant: "destructive",
      });
      return;
    }

    const binToRemove = editedBins[binIndex];
    if (binToRemove.values.length > 0) {
      toast({
        title: "Cannot Remove Bin",
        description: "Please move all values out of this bin before removing it.",
        variant: "destructive",
      });
      return;
    }

    // Remove the bin and renumber the remaining bins
    const updatedBins = editedBins.filter((_, index) => index !== binIndex);
    const renumberedBins = renumberBins(updatedBins);
    setEditedBins(renumberedBins);
  };

  const handleMoveValue = async (value: string, fromBinIndex: number, toBinIndex: number) => {
    if (fromBinIndex === toBinIndex) return;

    const newBins = [...editedBins];
    
    // Remove value from source bin
    newBins[fromBinIndex] = {
      ...newBins[fromBinIndex],
      values: newBins[fromBinIndex].values.filter(v => v !== value)
    };
    
    // Add value to target bin
    newBins[toBinIndex] = {
      ...newBins[toBinIndex],
      values: [...newBins[toBinIndex].values, value]
    };
    
    // Update state immediately for UI responsiveness
    setEditedBins(newBins);
    
    // Evaluate splits to get updated statistics
    await evaluateSplits(newBins);
  };

  const handleDragStart = (value: string, binIndex: number) => {
    setDraggedValue({ value, sourceBinIndex: binIndex });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetBinIndex: number) => {
    e.preventDefault();
    
    if (draggedValue) {
      handleMoveValue(draggedValue.value, draggedValue.sourceBinIndex, targetBinIndex);
      setDraggedValue(null);
    }
  };

  const handleSave = async () => {
    // Validate that all bins have at least one value
    const emptyBins = editedBins.filter(bin => bin.values.length === 0);
    if (emptyBins.length > 0) {
      toast({
        title: "Empty Bins Found",
        description: "Please ensure all bins contain at least one value or remove empty bins.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Renumber bins sequentially
      const renumberedBins = renumberBins(
        editedBins.filter(bin => bin.values.length > 0)
      );

      console.log('Submitting categorical edit split:', renumberedBins);
      
      // First, delete any existing subtree
      console.log('Calling /api/delSubTree...');
      await apiService.delSubTree(nodeNumber);
      console.log('delSubTree completed');
      
      // Prepare the splits data for the API call
      const splitsForAPI = renumberedBins.map((bin, index) => {
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
          description: "Categorical bins updated successfully!",
        });
        
        // Call the parent's onSave callback with updated bins
        onSave(renumberedBins);
        onClose();
      } else {
        toast({
          title: "Error",
          description: response.message || "Failed to update categorical bins.",
          variant: "destructive",
        });
      }
      
    } catch (error) {
      console.error('Error updating categorical bins:', error);
      toast({
        title: "Error",
        description: "Failed to update categorical bins. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setEditedBins([...bins]);
    onClose();
  };

  const formatEventRate = (rate: number) => {
    return (rate * 100).toFixed(1) + '%';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1200px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit Categorical Bins</DialogTitle>
          <DialogDescription>
            Drag and drop values between bins, or create new bins. Each bin will become a separate branch in the decision tree.
          </DialogDescription>
        </DialogHeader>

        {/* Action Buttons */}
        <div className="flex-shrink-0 flex justify-between items-center p-4 bg-muted/30 rounded-lg border">
          <div className="flex items-center space-x-2">
            <Button onClick={handleAddNewBin} size="sm" className="h-8">
              <Plus className="h-4 w-4 mr-1" />
              Add New Bin
            </Button>
            <span className="text-sm text-muted-foreground">
              Drag values between bins to reorganize them
            </span>
          </div>
        </div>

        {/* Bins Grid */}
        <div className="flex-1 overflow-hidden min-h-0">
          <div className="h-full overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {editedBins.map((bin, binIndex) => (
                <Card 
                  key={binIndex} 
                  className="relative"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, binIndex)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        Bin {bin.bin_number}
                      </CardTitle>
                      <div className="flex items-center space-x-1">
                        <Badge variant="outline" className="text-xs">
                          {bin.values.length} values
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveBin(binIndex)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    {/* Values */}
                    <div className="space-y-2">
                      {bin.values.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground text-sm border-2 border-dashed border-muted rounded-lg">
                          Drop values here
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {bin.values.map((value, valueIndex) => (
                            <Badge
                              key={valueIndex}
                              variant="secondary"
                              className="text-xs px-2 py-1 cursor-move hover:bg-secondary/80 transition-colors"
                              draggable
                              onDragStart={() => handleDragStart(value, binIndex)}
                            >
                              <GripVertical className="h-3 w-3 mr-1" />
                              {value}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Statistics */}
                    {bin.values.length > 0 && (
                      <div className="mt-3 pt-3 border-t space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Count:</span>
                          {isEvaluating ? (
                            <div className="animate-pulse bg-muted h-4 w-8 rounded"></div>
                          ) : (
                            <span className="font-mono">{bin.all_records.toLocaleString()}</span>
                          )}
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{regressionFlag === 1 ? 'Average:' : 'Event Rate:'}</span>
                          {isEvaluating ? (
                            <div className="animate-pulse bg-muted h-4 w-10 rounded"></div>
                          ) : (
                            <Badge 
                              variant={regressionFlag === 1 ? "outline" : bin.event_rate > 0.5 ? "default" : "outline"}
                              className="text-xs h-4 px-1"
                            >
                              {regressionFlag === 1
                                ? Number(bin.event_rate || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : formatEventRate(bin.event_rate)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditCategoricalBinsDialog;
