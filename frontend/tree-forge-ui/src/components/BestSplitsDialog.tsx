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
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface BestSplitData {
  all_records: number;
  event_rate: number;
  events: number;
  list_values: string | string[];
  lower_bound: number;
  missing: boolean;
  upper_bound: number;
  variable: string;
}

interface EditableSplitData extends BestSplitData {
  editable_lower_bound: number;
  editable_upper_bound: number;
}

interface BestSplitsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  nodeNumber: number;
  variableName: string;
  onSplit: (selectedVariable: string) => void;
}

const BestSplitsDialog: React.FC<BestSplitsDialogProps> = ({
  isOpen,
  onClose,
  nodeNumber,
  variableName,
  onSplit,
}) => {
  const [bestSplits, setBestSplits] = useState<EditableSplitData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [newBinCutoff, setNewBinCutoff] = useState<string>('');
  const [selectedMissingBin, setSelectedMissingBin] = useState<number>(0);
  const { toast } = useToast();

  // Fetch best splits when dialog opens
  useEffect(() => {
    if (isOpen && nodeNumber && variableName) {
      fetchBestSplits();
    }
  }, [isOpen, nodeNumber, variableName]);

  const fetchBestSplits = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.bestSplit(nodeNumber, variableName);
      
      // Convert to editable format with separate editable bounds
      const editableSplits: EditableSplitData[] = response.best_split.map(split => ({
        ...split,
        editable_lower_bound: split.lower_bound,
        editable_upper_bound: split.upper_bound,
      }));
      
      setBestSplits(editableSplits);
      
      // Set default missing selection - find bin with missing=1, default to 0 if none found
      const missingBinIndex = editableSplits.findIndex(split => split.missing);
      setSelectedMissingBin(missingBinIndex >= 0 ? missingBinIndex : 0);
    } catch (error) {
      console.error('Error fetching best splits:', error);
      toast({
        title: "Error",
        description: "Failed to fetch best splits. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Evaluate splits with current bounds
  const evaluateSplits = useCallback(async (splits: EditableSplitData[]) => {
    try {
      setIsEvaluating(true);
      const splitsForAPI = splits.map((split, index) => ({
        lower_bound: split.editable_lower_bound,
        upper_bound: split.editable_upper_bound,
        missing: selectedMissingBin === index ? 1 : 0
      }));
      
      const response = await apiService.evalSplit(nodeNumber, variableName, splitsForAPI);
      
      // Update the splits with new evaluation data
      const updatedSplits = splits.map((split, index) => ({
        ...split,
        ...response.eval_split[index],
        editable_lower_bound: split.editable_lower_bound,
        editable_upper_bound: split.editable_upper_bound
      }));
      
      setBestSplits(updatedSplits);
    } catch (error) {
      console.error('Error evaluating splits:', error);
      toast({
        title: "Error",
        description: "Failed to evaluate splits. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsEvaluating(false);
    }
  }, [nodeNumber, variableName, toast]);

  const handleBoundChange = (index: number, field: 'editable_lower_bound' | 'editable_upper_bound', value: string) => {
    // Only update the local state, don't trigger any API calls or adjustments
    setBestSplits(prev => prev.map((split, idx) => 
      idx === index ? { ...split, [field]: value } : split
    ));
  };

  const handleBoundBlur = (index: number, field: 'editable_lower_bound' | 'editable_upper_bound') => {
    const currentValue = bestSplits[index][field];
    const numericValue = parseFloat(currentValue);
    
    if (!isNaN(numericValue)) {
      setBestSplits(prev => {
        const newSplits = [...prev];
        newSplits[index] = { ...newSplits[index], [field]: numericValue };
        
        // Auto-adjust adjacent bounds
        if (field === 'editable_upper_bound' && index < newSplits.length - 1) {
          // Update next bin's lower bound
          newSplits[index + 1] = { 
            ...newSplits[index + 1], 
            editable_lower_bound: numericValue 
          };
        } else if (field === 'editable_lower_bound' && index > 0) {
          // Update previous bin's upper bound
          newSplits[index - 1] = { 
            ...newSplits[index - 1], 
            editable_upper_bound: numericValue 
          };
        }
        
        // Handle lower bound changes with proper bin cleanup
        let validSplits = [...newSplits];
        
        if (field === 'editable_lower_bound') {
          const newLowerBound = numericValue;
          
          // Find the last valid bin before the current one (with lower_bound < newLowerBound)
          let prevValidIndex = -1;
          for (let i = index - 1; i >= 0; i--) {
            if (validSplits[i].editable_lower_bound < newLowerBound) {
              prevValidIndex = i;
              break;
            }
          }
          
          // Remove all bins with lower_bound >= newLowerBound (including the current bin if it was changed)
          validSplits = validSplits.filter(split => split.editable_lower_bound < newLowerBound);
          
          // Add the current bin with the new lower bound
          validSplits.push({
            ...newSplits[index],
            editable_lower_bound: newLowerBound
          });
          
          // Adjust the previous valid bin's upper bound to match the new lower bound
          if (prevValidIndex !== -1 && prevValidIndex < validSplits.length - 1) {
            validSplits[prevValidIndex] = {
              ...validSplits[prevValidIndex],
              editable_upper_bound: newLowerBound
            };
          }
        }
        
        // Filter out any remaining invalid bins (upper_bound <= lower_bound)
        validSplits = validSplits.filter(split => 
          split.editable_upper_bound > split.editable_lower_bound
        );
        
        // Sort bins by lower bound to ensure proper order
        validSplits.sort((a, b) => a.editable_lower_bound - b.editable_lower_bound);
        
        // Ensure contiguous bounds: each bin's upper bound should equal the next bin's lower bound
        for (let i = 0; i < validSplits.length - 1; i++) {
          const current = validSplits[i];
          const next = validSplits[i + 1];
          
          // If there's a gap, adjust the next bin's lower bound
          if (current.editable_upper_bound !== next.editable_lower_bound) {
            next.editable_lower_bound = current.editable_upper_bound;
          }
        }
        
        // Reset missing selection to bin 1 (index 0) when bins are modified
        setSelectedMissingBin(0);
        
        // Evaluate splits after all adjustments are made
        evaluateSplits(validSplits);
        return validSplits;
      });
    }
  };


  const handleAddBin = () => {
    const cutoff = parseFloat(newBinCutoff);
    if (isNaN(cutoff)) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid number for the cutoff.",
        variant: "destructive",
      });
      return;
    }

    setBestSplits(prev => {
      const newSplits = [...prev];
      
      // Find the bin that contains the cutoff value
      let targetBinIndex = -1;
      for (let i = 0; i < newSplits.length; i++) {
        const bin = newSplits[i];
        if (cutoff > bin.editable_lower_bound && cutoff < bin.editable_upper_bound) {
          targetBinIndex = i;
          break;
        }
      }
      
      if (targetBinIndex === -1) {
        toast({
          title: "Invalid Cutoff",
          description: "The cutoff value must be within an existing bin's range.",
          variant: "destructive",
        });
        return prev;
      }
      
      // Get the target bin
      const targetBin = newSplits[targetBinIndex];
      
      // Create two new bins to replace the target bin
      const leftBin: EditableSplitData = {
        ...targetBin,
        editable_lower_bound: targetBin.editable_lower_bound,
        editable_upper_bound: cutoff
      };
      
      const rightBin: EditableSplitData = {
        ...targetBin,
        editable_lower_bound: cutoff,
        editable_upper_bound: targetBin.editable_upper_bound
      };
      
      // Replace the target bin with the two new bins
      newSplits.splice(targetBinIndex, 1, leftBin, rightBin);
      
      setNewBinCutoff('');
      
      // Evaluate splits after adding the new bin
      evaluateSplits(newSplits);
      
      return newSplits;
    });
  };

  const handleSubmit = async () => {
    try {
      console.log('Submitting force split with modified bounds:', bestSplits);
      
      // First, delete any existing subtree
      console.log('Calling /api/delSubTree...');
      await apiService.delSubTree(nodeNumber);
      console.log('delSubTree completed');
      
      // Ensure at least one bin is selected for missing, default to bin 1 (index 0)
      const finalMissingSelection = selectedMissingBin >= 0 ? selectedMissingBin : 0;
      
      // Prepare the splits data for the API call
      const splitsForAPI = bestSplits.map((split, index) => ({
        lower_bound: split.editable_lower_bound,
        upper_bound: split.editable_upper_bound,
        list_values: `(${split.editable_lower_bound}, ${split.editable_upper_bound}]`,
        missing: finalMissingSelection === index ? 1 : 0
      }));
      
      // Call the addNode API
      console.log('Calling /api/addNode...');
      const response = await apiService.addNode(nodeNumber, variableName, splitsForAPI);
      
      if (response.success) {
        toast({
          title: "Success",
          description: "Force split applied successfully!",
        });
        
        // Close the dialog and trigger tree refresh
        onSplit(variableName);
        onClose();
      } else {
        toast({
          title: "Error",
          description: response.message || "Failed to apply force split.",
          variant: "destructive",
        });
      }
      
    } catch (error) {
      console.error('Error applying force split:', error);
      toast({
        title: "Error",
        description: "Failed to apply force split. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    onClose();
  };

  const formatEventRate = (rate: number) => {
    return (rate * 100).toFixed(1) + '%';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Best Splits - {variableName}</DialogTitle>
          <DialogDescription>
            Review and modify the best splits for {variableName} at Node {nodeNumber}. You can edit the bounds before applying the split.
          </DialogDescription>
        </DialogHeader>

        {/* Add Bin Section - Fixed at top */}
        <div className="flex-shrink-0 p-4 bg-muted/30 rounded-lg border">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <Label htmlFor="new-bin-cutoff" className="text-sm font-medium">
                Add New Bin
              </Label>
              <Input
                id="new-bin-cutoff"
                type="number"
                step="0.01"
                placeholder="Enter cutoff value"
                value={newBinCutoff}
                onChange={(e) => setNewBinCutoff(e.target.value)}
                className="mt-1 h-8"
              />
            </div>
            <Button 
              onClick={handleAddBin}
              disabled={!newBinCutoff || isEvaluating}
              className="mt-6 h-8 px-3"
              size="sm"
            >
              Add Bin
            </Button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-hidden min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="ml-2 text-muted-foreground">Loading best splits...</span>
            </div>
          ) : bestSplits.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No best splits available.
            </div>
          ) : (
            <div className="h-full max-h-[300px] overflow-y-auto border rounded-lg">
              {/* Compact Table Header */}
              <div className="sticky top-0 bg-background border-b z-10">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
                  <div className="col-span-1 text-center">#</div>
                  <div className="col-span-3">Lower Bound</div>
                  <div className="col-span-3">Upper Bound</div>
                  <div className="col-span-2 text-right">Records</div>
                  <div className="col-span-2 text-right">Event Rate</div>
                  <div className="col-span-1 text-center">Missing</div>
                </div>
              </div>
              
              {/* Compact Table Rows */}
              <div className="divide-y">
                {bestSplits.map((split, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 px-3 py-2 hover:bg-accent/30 transition-colors">
                    {/* Bin Number */}
                    <div className="col-span-1 flex items-center justify-center">
                      <Badge variant="outline" className="text-xs w-6 h-6 flex items-center justify-center p-0">
                        {index + 1}
                      </Badge>
                    </div>
                    
                    {/* Lower Bound (Editable) */}
                    <div className="col-span-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={split.editable_lower_bound}
                        onChange={(e) => handleBoundChange(index, 'editable_lower_bound', e.target.value)}
                        onBlur={() => handleBoundBlur(index, 'editable_lower_bound')}
                        className="h-7 text-xs"
                      />
                    </div>
                    
                    {/* Upper Bound (Editable) */}
                    <div className="col-span-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={split.editable_upper_bound}
                        onChange={(e) => handleBoundChange(index, 'editable_upper_bound', e.target.value)}
                        onBlur={() => handleBoundBlur(index, 'editable_upper_bound')}
                        className="h-7 text-xs"
                      />
                    </div>
                    
                    {/* # of Records */}
                    <div className="col-span-2 flex items-center justify-end">
                      {isEvaluating ? (
                        <div className="animate-pulse bg-muted h-5 w-12 rounded"></div>
                      ) : (
                        <span className="text-xs font-mono">
                          {split.all_records.toLocaleString()}
                        </span>
                      )}
                    </div>
                    
                    {/* Event Rate */}
                    <div className="col-span-2 flex items-center justify-end">
                      {isEvaluating ? (
                        <div className="animate-pulse bg-muted h-5 w-10 rounded"></div>
                      ) : (
                        <Badge 
                          variant={split.event_rate > 0.5 ? "default" : "outline"}
                          className="text-xs h-5 px-2"
                        >
                          {formatEventRate(split.event_rate)}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Missing Selection */}
                    <div className="col-span-1 flex items-center justify-center">
                      <input
                        type="radio"
                        name="missing-bin"
                        checked={selectedMissingBin === index}
                        onChange={() => setSelectedMissingBin(index)}
                        className="w-3 h-3"
                      />
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
            disabled={isLoading || bestSplits.length === 0}
          >
            Apply Force Split
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BestSplitsDialog;
