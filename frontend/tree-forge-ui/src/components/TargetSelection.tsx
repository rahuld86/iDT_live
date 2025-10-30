import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";

interface TargetSelectionProps {
  columnNames: string[];
  selectedTarget: string;
  onTargetChange: (value: string) => void;
  selectedRegressionFlag: number;
  onRegressionFlagChange: (value: number) => void;
  sampleData: Record<string, any>[];
}

const TargetSelection = ({ 
  columnNames, 
  selectedTarget, 
  onTargetChange, 
  selectedRegressionFlag, 
  onRegressionFlagChange, 
  sampleData 
}: TargetSelectionProps) => {
  const [autoDetectedType, setAutoDetectedType] = useState<number | null>(null);

  // Function to analyze target variable values and determine if it's binary classification or regression
  const analyzeTargetValues = (targetColumn: string) => {
    if (!targetColumn || !sampleData || sampleData.length === 0) return null;

    const values = sampleData.map(row => row[targetColumn]).filter(val => val !== null && val !== undefined);
    const uniqueValues = [...new Set(values)];
    
    // Check if values are only 0, 1, and possibly missing/null
    const numericValues = uniqueValues.filter(val => {
      const num = Number(val);
      return !isNaN(num) && (num === 0 || num === 1);
    });
    
    // If all unique values are 0, 1, or missing, it's binary classification
    if (numericValues.length === uniqueValues.length && uniqueValues.length <= 2) {
      return 0; // Binary classification
    }
    
    // Otherwise, it's regression
    return 1; // Regression
  };

  // Auto-detect regression flag when target changes
  useEffect(() => {
    if (selectedTarget) {
      const detectedType = analyzeTargetValues(selectedTarget);
      setAutoDetectedType(detectedType);
      if (detectedType !== null) {
        onRegressionFlagChange(detectedType);
      }
    }
  }, [selectedTarget, sampleData, onRegressionFlagChange]);

  return (
    <Card className="shadow-card border-0">
      <CardHeader>
        <CardTitle>Select Target Variable</CardTitle>
        <CardDescription>
          Choose the variable you want to predict with your decision tree
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-4">
            <Label htmlFor="target-variable" className="text-sm font-medium">
              Target Variable
            </Label>
            <Select value={selectedTarget} onValueChange={onTargetChange}>
              <SelectTrigger className={`w-full ${!selectedTarget ? 'border-destructive' : ''}`}>
                <SelectValue placeholder="Select target variable" />
              </SelectTrigger>
              <SelectContent>
                {columnNames.map((column) => (
                  <SelectItem key={column} value={column}>
                    {column}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!selectedTarget && (
              <p className="text-sm text-destructive">
                Please select a target variable to continue
              </p>
            )}
          </div>

          {selectedTarget && (
            <div className="space-y-4">
              <Label htmlFor="regression-type" className="text-sm font-medium">
                Problem Type
              </Label>
              <Select 
                value={selectedRegressionFlag.toString()} 
                onValueChange={(value) => onRegressionFlagChange(Number(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select problem type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Binary Classification</SelectItem>
                  <SelectItem value="1">Regression</SelectItem>
                </SelectContent>
              </Select>
              {autoDetectedType !== null && (
                <p className="text-sm text-muted-foreground">
                  {autoDetectedType === 0 
                    ? "Auto-detected: Binary classification (values are 0/1)" 
                    : "Auto-detected: Regression (continuous values detected)"
                  }
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TargetSelection;