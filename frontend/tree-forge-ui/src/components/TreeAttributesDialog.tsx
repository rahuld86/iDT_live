import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { TreeAttributes } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/services/api";

interface TreeAttributesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentAttributes: TreeAttributes;
  onAttributesUpdated?: (attributes: TreeAttributes) => void;
}

const TreeAttributesDialog = ({ 
  isOpen, 
  onClose, 
  currentAttributes, 
  onAttributesUpdated 
}: TreeAttributesDialogProps) => {
  const { toast } = useToast();
  const [attributes, setAttributes] = useState<TreeAttributes>(currentAttributes);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update local state when dialog opens with new current attributes
  useEffect(() => {
    if (isOpen) {
      setAttributes(currentAttributes);
    }
  }, [isOpen, currentAttributes]);

  const handleAttributeChange = (key: string, value: string) => {
    setAttributes(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Convert string values to numbers for API call
      const apiParams = {
        max_depth: parseInt(attributes.maxDepth, 10),
        min_node_split: parseInt(attributes.minNodeSplit, 10),
        min_leaf_size: parseInt(attributes.minLeafSize, 10),
        max_branches: parseInt(attributes.maxBranches, 10),
        criteria: attributes.criteria,
        unique_var: parseInt(attributes.uniqueVar, 10),
        monotonous: parseInt(attributes.monotonousSplits, 10)
      };

      await apiService.defineHyperparameters(apiParams);
      
      toast({
        title: "Success",
        description: "Tree attributes updated successfully!"
      });

      // Notify parent component of the update
      if (onAttributesUpdated) {
        onAttributesUpdated(attributes);
      }

      onClose();
    } catch (error) {
      console.error('Error updating tree attributes:', error);
      toast({
        title: "Error",
        description: "Failed to update tree attributes. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    // Reset to original attributes
    setAttributes(currentAttributes);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modify Tree Attributes</DialogTitle>
          <DialogDescription>
            Configure the parameters for your decision tree algorithm
          </DialogDescription>
        </DialogHeader>
        
        <TooltipProvider>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="max-depth">Max Depth</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>How may layers should the tree contain (Root node is layer 0)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="max-depth"
                type="number"
                value={attributes.maxDepth}
                onChange={(e) => handleAttributeChange('maxDepth', e.target.value)}
                placeholder="5"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="min-node-split">Min Node Split</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>If the number of records in a node is lower than this, the node will not get split</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="min-node-split"
                type="number"
                value={attributes.minNodeSplit}
                onChange={(e) => handleAttributeChange('minNodeSplit', e.target.value)}
                placeholder="500"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="min-leaf-size">Min Leaf Size</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Minimum number of records that a leaf should contain</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="min-leaf-size"
                type="number"
                value={attributes.minLeafSize}
                onChange={(e) => handleAttributeChange('minLeafSize', e.target.value)}
                placeholder="100"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="max-branches">Max Branches</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Maximum number of branches that a node can be split into</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="max-branches"
                type="number"
                value={attributes.maxBranches}
                onChange={(e) => handleAttributeChange('maxBranches', e.target.value)}
                placeholder="5"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="criteria">Criteria</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>How the splits are decided</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select value={attributes.criteria} onValueChange={(value) => handleAttributeChange('criteria', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entropy">Entropy</SelectItem>
                  <SelectItem value="gini">Gini</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="unique-var">Unique Var</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>1 if you don't want the same variable to repeat in the same branch. 0 if you don't care</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select value={attributes.uniqueVar} onValueChange={(value) => handleAttributeChange('uniqueVar', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="monotonous-splits">Monotonous Splits</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>1 if the splits should rank order</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select value={attributes.monotonousSplits} onValueChange={(value) => handleAttributeChange('monotonousSplits', value)}>
                <SelectTrigger className="md:w-1/2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TooltipProvider>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Updating..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TreeAttributesDialog;
