import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiService } from '@/services/api';
import EditCategoricalBinsDialog from './EditCategoricalBinsDialog';

interface EditSplitData {
  all_records: number;
  event_rate: number;
  events: number;
  list_values: string | string[];
  lower_bound: number;
  missing: boolean;
  upper_bound: number;
  variable: string;
}

interface EditableSplitData extends EditSplitData {
  editable_lower_bound: number;
  editable_upper_bound: number;
}

interface EditSplitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  nodeNumber: number;
  variableName: string;
  nodeMaster: any[];
  onSplit: (variableName: string) => void;
}

const EditSplitDialog: React.FC<EditSplitDialogProps> = ({
  isOpen,
  onClose,
  nodeNumber,
  variableName,
  nodeMaster,
  onSplit,
}) => {
  const [currentSplits, setCurrentSplits] = useState<EditableSplitData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [newBinCutoff, setNewBinCutoff] = useState('');
  const [selectedMissingBin, setSelectedMissingBin] = useState<number>(0);
  const [categoricalEditDialog, setCategoricalEditDialog] = useState<{
    isOpen: boolean;
    bins: any[];
  }>({
    isOpen: false,
    bins: []
  });
  const { toast } = useToast();

  // Fetch current splits when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchCurrentSplits();
    }
  }, [isOpen, nodeNumber, variableName, nodeMaster]);

  const fetchCurrentSplits = () => {
    try {
      setIsLoading(true);
      
      // Extract child nodes from node_master where parent_node equals nodeNumber
      const childNodes = nodeMaster.filter(node => node.parent_node === nodeNumber);
      
      if (childNodes.length > 0) {
        // Check if this is a categorical variable by looking at list_values format
        const isCategorical = childNodes.some(node => 
          Array.isArray(node.list_values) || 
          (typeof node.list_values === 'string' && !node.list_values.match(/\([^,]+,\s*[^\]]+\)/))
        );
        
        if (isCategorical) {
          // Handle categorical variables
          const categoricalBins = childNodes.map((childNode, index) => {
            let binValues: string[] = [];
            
            if (Array.isArray(childNode.list_values)) {
              binValues = [...childNode.list_values];
            } else if (typeof childNode.list_values === 'string') {
              binValues = childNode.list_values.split(',').map(v => v.trim());
            }
            
            // Add "Missing" to the values if this node has missing=1
            if (childNode.missing === 1) {
              binValues.push('Missing');
            }
            
            return {
              bin_number: index + 1,
              values: binValues,
              events: childNode.events || 0,
              event_rate: childNode.event_rate || 0,
              all_records: childNode.count || childNode.all_records || 0,
              hasMissing: childNode.missing === 1
            };
          });
          
          setCategoricalEditDialog({
            isOpen: true,
            bins: categoricalBins
          });
          setIsLoading(false);
          return;
        }
        
        // Handle numerical variables (existing logic)
        const editableSplits: EditableSplitData[] = childNodes.map((childNode, index) => {
          // Parse the list_values to extract bounds
          let lower_bound = 0;
          let upper_bound = 0;
          
          if (childNode.list_values && typeof childNode.list_values === 'string') {
            // Parse format like "(0, 156]" or "(156, 199]"
            const match = childNode.list_values.match(/\(([^,]+),\s*([^\]]+)\]/);
            if (match) {
              lower_bound = parseFloat(match[1]);
              upper_bound = parseFloat(match[2]);
            }
          }
          
          return {
            all_records: childNode.count || childNode.all_records || 0,
            event_rate: childNode.event_rate || 0,
            events: childNode.events || 0,
            list_values: childNode.list_values || [],
            lower_bound: lower_bound,
            missing: childNode.missing === 1 || childNode.missing === true,
            upper_bound: upper_bound,
            variable: childNode.variable || variableName,
            editable_lower_bound: lower_bound,
            editable_upper_bound: upper_bound,
          };
        });
        
        // Sort by lower_bound to maintain order
        editableSplits.sort((a, b) => a.editable_lower_bound - b.editable_lower_bound);
        
        // Filter out invalid bins (where upper_bound <= lower_bound)
        const validSplits = editableSplits.filter(split => 
          split.editable_upper_bound > split.editable_lower_bound
        );
        
        setCurrentSplits(validSplits);
        
        // Set default missing selection - find bin with missing=1, default to 0 if none found
        const missingBinIndex = validSplits.findIndex(split => split.missing);
        setSelectedMissingBin(missingBinIndex >= 0 ? missingBinIndex : 0);
      } else {
        setCurrentSplits([]);
        setSelectedMissingBin(0);
      }
    } catch (error) {
      console.error('Error extracting current splits:', error);
      toast({
        title: "Error",
        description: "Failed to extract current splits. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

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
      
      setCurrentSplits(updatedSplits);
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
    setCurrentSplits(prev => prev.map((split, idx) => 
      idx === index ? { ...split, [field]: value } : split
    ));
  };

  const handleBoundBlur = (index: number, field: 'editable_lower_bound' | 'editable_upper_bound') => {
    const currentValue = currentSplits[index][field];
    const numericValue = parseFloat(currentValue);
    
    if (!isNaN(numericValue)) {
      setCurrentSplits(prev => {
        const newSplits = [...prev];
        newSplits[index] = { ...newSplits[index], [field]: numericValue };
        
        let validSplits = [...newSplits];
        
        if (field === 'editable_upper_bound') {
          // When upper bound is changed, remove all subsequent bins with upper_bound <= new upper bound
          // and adjust the next bin's lower bound
          const newUpperBound = numericValue;
          
          // Find the next valid bin after the current one
          let nextValidIndex = -1;
          for (let i = index + 1; i < validSplits.length; i++) {
            if (validSplits[i].editable_upper_bound > newUpperBound) {
              nextValidIndex = i;
              break;
            }
          }
          
          // Remove all bins between current and next valid (inclusive of bins with upper_bound <= newUpperBound)
          if (nextValidIndex !== -1) {
            // Adjust the next valid bin's lower bound
            validSplits[nextValidIndex] = {
              ...validSplits[nextValidIndex],
              editable_lower_bound: newUpperBound
            };
            // Keep only bins up to current index and the next valid bin onwards
            validSplits = [
              ...validSplits.slice(0, index + 1),
              ...validSplits.slice(nextValidIndex)
            ];
          } else {
            // No valid bins after, keep only up to current index
            validSplits = validSplits.slice(0, index + 1);
          }
          
        } else if (field === 'editable_lower_bound') {
          // When lower bound is changed, remove all bins with lower_bound >= new lower bound
          // and adjust the previous bin's upper bound
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
          
          // Sort bins by lower bound to maintain order
          validSplits.sort((a, b) => a.editable_lower_bound - b.editable_lower_bound);
        }
        
        // Filter out any remaining invalid bins (upper_bound <= lower_bound)
        validSplits = validSplits.filter(split => 
          split.editable_upper_bound > split.editable_lower_bound
        );
        
        // Renumber bins and reset missing selection to bin 1
        validSplits = validSplits.map((split, idx) => ({
          ...split,
          // Update any bin-specific properties if needed
        }));
        
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

    setCurrentSplits(prev => {
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
      
      // Reset missing selection to first bin when new bins are added
      setSelectedMissingBin(0);
      
      // Evaluate splits after adding the new bin
      evaluateSplits(newSplits);
      
      return newSplits;
    });
  };

  const handleSubmit = async () => {
    try {
      
      // First, delete any existing subtree
      await apiService.delSubTree(nodeNumber);
      
      // Ensure at least one bin is selected for missing, default to bin 1 (index 0)
      const finalMissingSelection = selectedMissingBin >= 0 ? selectedMissingBin : 0;
      
      // Prepare the splits data for the API call
      const splitsForAPI = currentSplits.map((split, index) => ({
        lower_bound: split.editable_lower_bound,
        upper_bound: split.editable_upper_bound,
        list_values: `(${split.editable_lower_bound}, ${split.editable_upper_bound}]`,
        missing: finalMissingSelection === index ? 1 : 0
      }));
      
      // Call the addNode API
      const response = await apiService.addNode(nodeNumber, variableName, splitsForAPI);
      
      if (response.success) {
        toast({
          title: "Success",
          description: "Split edited successfully!",
        });
        
        // Close the dialog and trigger tree refresh
        onSplit(variableName);
        onClose();
      } else {
        toast({
          title: "Error",
          description: response.message || "Failed to edit split.",
          variant: "destructive",
        });
      }
      
    } catch (error) {
      console.error('Error editing split:', error);
      toast({
        title: "Error",
        description: "Failed to edit split. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    onClose();
  };

  const handleCategoricalEditDialogClose = () => {
    setCategoricalEditDialog({
      isOpen: false,
      bins: []
    });
  };

  const handleCategoricalBinsUpdated = (updatedBins: any[]) => {
    // The API call has already been made in EditCategoricalBinsDialog
    // Just trigger the tree refresh and close the dialog
    onSplit(variableName);
    onClose();
  };

  const formatEventRate = (rate: number) => {
    return (rate * 100).toFixed(1) + '%';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {!categoricalEditDialog.isOpen && (
        <DialogContent className="sm:max-w-[900px] max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit Split - {variableName}</DialogTitle>
          <DialogDescription>
            Edit the current splits for {variableName} at Node {nodeNumber}. You can modify the bounds before applying the changes.
          </DialogDescription>
        </DialogHeader>

        {/* Add New Bin Section */}
        <div className="flex-shrink-0 flex items-center gap-2 p-4 border-b">
          <span className="text-sm font-medium">Add New Bin</span>
          <Input
            type="number"
            placeholder="Enter cutoff value"
            value={newBinCutoff}
            onChange={(e) => setNewBinCutoff(e.target.value)}
            className="w-40 h-8 text-xs"
          />
          <Button
            onClick={handleAddBin}
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={!newBinCutoff || isLoading}
          >
            Add Bin
          </Button>
        </div>

        {/* Main Content Area with Scrollbar */}
        <div className="flex-1 overflow-hidden min-h-0">
          <div className="h-full max-h-[300px] overflow-y-auto border rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-sm text-muted-foreground">Loading current splits...</div>
              </div>
            ) : (
              <>
                {/* Table Header */}
                <div className="sticky top-0 bg-background border-b z-10">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <div className="col-span-1">#</div>
                    <div className="col-span-2">Lower Bound</div>
                    <div className="col-span-2">Upper Bound</div>
                    <div className="col-span-2">Records</div>
                    <div className="col-span-2">Event Rate</div>
                    <div className="col-span-3 text-center">Missing</div>
                  </div>
                </div>

                {/* Table Rows */}
                {currentSplits.map((split, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-muted/50">
                    <div className="col-span-1 flex items-center">
                      <Badge variant="outline" className="text-xs h-5 px-2">
                        {index + 1}
                      </Badge>
                    </div>
                    <div className="col-span-2 flex items-center">
                      <Input
                        type="number"
                        value={split.editable_lower_bound}
                        onChange={(e) => handleBoundChange(index, 'editable_lower_bound', e.target.value)}
                        onBlur={() => handleBoundBlur(index, 'editable_lower_bound')}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="col-span-2 flex items-center">
                      <Input
                        type="number"
                        value={split.editable_upper_bound}
                        onChange={(e) => handleBoundChange(index, 'editable_upper_bound', e.target.value)}
                        onBlur={() => handleBoundBlur(index, 'editable_upper_bound')}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="col-span-2 flex items-center">
                      {isEvaluating ? (
                        <div className="h-5 w-16 bg-muted animate-pulse rounded"></div>
                      ) : (
                        <Badge variant="secondary" className="text-xs h-5 px-2">
                          {split.all_records}
                        </Badge>
                      )}
                    </div>
                    <div className="col-span-2 flex items-center">
                      {isEvaluating ? (
                        <div className="h-5 w-12 bg-muted animate-pulse rounded"></div>
                      ) : (
                        <Badge variant="secondary" className="text-xs h-5 px-2">
                          {formatEventRate(split.event_rate)}
                        </Badge>
                      )}
                    </div>
                    <div className="col-span-3 flex items-center justify-center">
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
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isLoading || currentSplits.length === 0}
          >
            Apply Edit Split
          </Button>
        </DialogFooter>
        </DialogContent>
      )}

      {/* Categorical Edit Dialog */}
      <EditCategoricalBinsDialog
        isOpen={categoricalEditDialog.isOpen}
        onClose={handleCategoricalEditDialogClose}
        bins={categoricalEditDialog.bins}
        onSave={handleCategoricalBinsUpdated}
        nodeNumber={nodeNumber}
        variableName={variableName}
      />
    </Dialog>
  );
};

export default EditSplitDialog;
