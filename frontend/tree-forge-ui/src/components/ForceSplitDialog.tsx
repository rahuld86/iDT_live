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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import BestSplitsDialog from './BestSplitsDialog';
import CategoricalSplitsDialog from './CategoricalSplitsDialog';

interface VariableWithIV {
  variable: string;
  iv?: number; // For classification problems
  rmse?: number; // For regression problems
}

interface ForceSplitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  nodeNumber: number;
  onSplit: (selectedVariable: string) => void;
}

const ForceSplitDialog: React.FC<ForceSplitDialogProps> = ({
  isOpen,
  onClose,
  nodeNumber,
  onSplit,
}) => {
  const [variables, setVariables] = useState<VariableWithIV[]>([]);
  const [selectedVariable, setSelectedVariable] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegression, setIsRegression] = useState(false);
  const [bestSplitsDialog, setBestSplitsDialog] = useState<{
    isOpen: boolean;
    variableName: string;
  }>({
    isOpen: false,
    variableName: ''
  });
  
  const [categoricalSplitsDialog, setCategoricalSplitsDialog] = useState<{
    isOpen: boolean;
    variableName: string;
  }>({
    isOpen: false,
    variableName: ''
  });
  const { toast } = useToast();

  // Fetch variables when dialog opens
  useEffect(() => {
    if (isOpen && nodeNumber) {
      fetchVariables();
    }
  }, [isOpen, nodeNumber]);

  const fetchVariables = async () => {
    try {
      setIsLoading(true);
      
      // First, check if this is a regression problem
      const regressionResponse = await apiService.getRegressionFlag();
      const isRegressionProblem = regressionResponse.regression_flag === 1;
      setIsRegression(isRegressionProblem);
      
      const response = await apiService.findVar(nodeNumber);
      
      // Sort variables based on problem type
      let sortedVariables;
      if (isRegressionProblem) {
        // For regression, sort by RMSE in ascending order (lower RMSE is better)
        sortedVariables = response.top_vars.sort((a, b) => (a.rmse || 0) - (b.rmse || 0));
      } else {
        // For classification, sort by IV in descending order (higher IV is better)
        sortedVariables = response.top_vars.sort((a, b) => (b.iv || 0) - (a.iv || 0));
      }
      
      setVariables(sortedVariables);
      
      // Auto-select the first variable (best performing)
      if (sortedVariables.length > 0) {
        setSelectedVariable(sortedVariables[0].variable);
      }
    } catch (error) {
      console.error('Error fetching variables:', error);
      toast({
        title: "Error",
        description: "Failed to fetch variables for force split. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Function to determine if a variable is categorical
  const isCategoricalVariable = async (variableName: string): Promise<boolean> => {
    try {
      const response = await apiService.bestSplit(nodeNumber, variableName);
      // Check if the first split has list_values as an array
      if (response.best_split && response.best_split.length > 0) {
        const firstSplit = response.best_split[0];
        return Array.isArray(firstSplit.list_values);
      }
      return false;
    } catch (error) {
      console.error('Error determining variable type:', error);
      return false;
    }
  };

  const handleSubmit = async () => {
    if (selectedVariable) {
      try {
        const isCategorical = await isCategoricalVariable(selectedVariable);
        
        if (isCategorical) {
          // Open the Categorical Splits dialog
          setCategoricalSplitsDialog({
            isOpen: true,
            variableName: selectedVariable
          });
        } else {
          // Open the Best Splits dialog for numerical variables
          setBestSplitsDialog({
            isOpen: true,
            variableName: selectedVariable
          });
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to determine variable type. Please try again.",
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "No Variable Selected",
        description: "Please select a variable to perform force split.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setSelectedVariable('');
    onClose();
  };

  const handleBestSplitsDialogClose = () => {
    setBestSplitsDialog({
      isOpen: false,
      variableName: ''
    });
  };

  const handleBestSplitsSubmit = (variableName: string) => {
    // Close both dialogs and perform the split
    handleBestSplitsDialogClose();
    onSplit(variableName);
    onClose();
  };

  const handleCategoricalSplitsDialogClose = () => {
    setCategoricalSplitsDialog({
      isOpen: false,
      variableName: ''
    });
  };

  const handleCategoricalSplitsSubmit = (variableName: string) => {
    // Close both dialogs and perform the split
    handleCategoricalSplitsDialogClose();
    onSplit(variableName);
    onClose();
  };

  const formatIV = (iv: number) => {
    return iv.toFixed(4);
  };

  const formatRMSE = (rmse: number) => {
    return rmse.toFixed(4);
  };

  const getIVBadgeVariant = (iv: number) => {
    if (iv >= 0.3) return 'default'; // High IV
    if (iv >= 0.1) return 'secondary'; // Medium IV
    return 'outline'; // Low IV
  };

  const getRMSEBadgeVariant = (rmse: number) => {
    if (rmse <= 0.1) return 'default'; // Low RMSE (good)
    if (rmse <= 0.5) return 'secondary'; // Medium RMSE
    return 'outline'; // High RMSE (not as good)
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Force Split - Node {nodeNumber}</DialogTitle>
            <DialogDescription>
              Select a variable to force a split on this node. Variables are sorted by {isRegression ? 'RMSE in ascending order' : 'Information Value (IV) in descending order'}.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span className="ml-2 text-muted-foreground">Loading variables...</span>
              </div>
            ) : variables.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No variables available for force split.
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {/* Column Headers */}
                <div className="grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
                  <div className="col-span-1"></div> {/* Radio button column */}
                  <div className="col-span-8">Variable</div>
                  <div className="col-span-3 text-right">{isRegression ? 'RMSE' : 'IV'}</div>
                </div>
                
                <RadioGroup
                  value={selectedVariable}
                  onValueChange={setSelectedVariable}
                  className="space-y-2"
                >
                  {variables.map((variable, index) => (
                    <Card key={variable.variable} className="cursor-pointer hover:bg-accent/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-1">
                            <RadioGroupItem
                              value={variable.variable}
                              id={`variable-${index}`}
                            />
                          </div>
                          <div className="col-span-8">
                            <Label
                              htmlFor={`variable-${index}`}
                              className="cursor-pointer font-medium"
                            >
                              {variable.variable}
                            </Label>
                          </div>
                          <div className="col-span-3 text-right">
                            <Badge variant={isRegression ? getRMSEBadgeVariant(variable.rmse || 0) : getIVBadgeVariant(variable.iv || 0)}>
                              {isRegression ? formatRMSE(variable.rmse || 0) : formatIV(variable.iv || 0)}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </RadioGroup>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={!selectedVariable || isLoading}
            >
              Get Best Splits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Best Splits Dialog */}
      <BestSplitsDialog
        isOpen={bestSplitsDialog.isOpen}
        onClose={handleBestSplitsDialogClose}
        nodeNumber={nodeNumber}
        variableName={bestSplitsDialog.variableName}
        onSplit={handleBestSplitsSubmit}
      />

      {/* Categorical Splits Dialog */}
      <CategoricalSplitsDialog
        isOpen={categoricalSplitsDialog.isOpen}
        onClose={handleCategoricalSplitsDialogClose}
        nodeNumber={nodeNumber}
        variableName={categoricalSplitsDialog.variableName}
        onSplit={handleCategoricalSplitsSubmit}
      />
    </>
  );
};

export default ForceSplitDialog;