import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { CheckSquare, Square } from "lucide-react";

interface DataTypesDefinitionProps {
  columnNames: string[];
  selectedTarget: string;
  dataTypes: Record<string, string>;
  onDataTypeChange: (column: string, type: string) => void;
  onBulkDataTypeChange?: (columns: string[], type: string) => void;
  isLoading?: boolean;
}

const DataTypesDefinition = ({ 
  columnNames, 
  selectedTarget, 
  dataTypes, 
  onDataTypeChange, 
  onBulkDataTypeChange,
  isLoading = false 
}: DataTypesDefinitionProps) => {
  const remainingColumns = columnNames.filter(col => col !== selectedTarget);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);

  // Handle individual checkbox selection
  const handleColumnSelect = (column: string, checked: boolean) => {
    const newSelected = new Set(selectedColumns);
    if (checked) {
      newSelected.add(column);
    } else {
      newSelected.delete(column);
    }
    setSelectedColumns(newSelected);
  };

  // Handle checkbox click with shift for range selection
  const handleColumnClick = (column: string, index: number, checked: boolean, event?: React.MouseEvent) => {
    const isShiftPressed = event?.shiftKey;
    
    if (isShiftPressed && lastSelectedIndex !== -1) {
      // Shift+click - range selection
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newSelected = new Set(selectedColumns);
      
      for (let i = start; i <= end; i++) {
        newSelected.add(remainingColumns[i]);
      }
      setSelectedColumns(newSelected);
    } else {
      // Regular click - single selection
      handleColumnSelect(column, checked);
      setLastSelectedIndex(index);
    }
  };

  // Select all / deselect all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedColumns(new Set(remainingColumns));
    } else {
      setSelectedColumns(new Set());
    }
  };

  // Bulk data type change
  const handleBulkTypeChange = (type: string) => {
    if (onBulkDataTypeChange && selectedColumns.size > 0) {
      onBulkDataTypeChange(Array.from(selectedColumns), type);
      setSelectedColumns(new Set()); // Clear selection after bulk change
    }
  };

  const allSelected = selectedColumns.size === remainingColumns.length && remainingColumns.length > 0;
  const someSelected = selectedColumns.size > 0 && selectedColumns.size < remainingColumns.length;

  return (
    <Card className="shadow-card border-0">
      <CardHeader>
        <CardTitle>Define Data Types</CardTitle>
        <CardDescription>
          Specify the data type for each variable to build an optimal decision tree. 
          Hold Shift to select a range of variables.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Bulk Actions */}
        {selectedColumns.size > 0 && onBulkDataTypeChange && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedColumns.size} variable{selectedColumns.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Set all to:</span>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleBulkTypeChange('categorical')}
                >
                  Categorical
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleBulkTypeChange('numerical')}
                >
                  Numerical
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleBulkTypeChange('drop')}
                >
                  Drop
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Select All */}
        <div className="mb-3 flex items-center gap-2 p-2 border-b">
          <Checkbox
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onCheckedChange={handleSelectAll}
          />
          <Label className="text-sm font-medium cursor-pointer">
            Select All ({remainingColumns.length} variables)
          </Label>
        </div>

        {/* Variables List - More Compact */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {isLoading ? (
            // Show loading skeletons
            remainingColumns.map((column) => (
              <div key={column} className="flex items-center gap-3 p-2 border border-border rounded">
                <Skeleton className="w-4 h-4" />
                <Skeleton className="flex-1 h-4" />
                <Skeleton className="w-32 h-8" />
              </div>
            ))
          ) : (
            // Show actual form
            remainingColumns.map((column, index) => {
              const isSelected = selectedColumns.has(column);
              return (
                <div 
                  key={column} 
                  className={`flex items-center gap-3 p-2 border rounded transition-colors cursor-pointer ${
                    isSelected ? 'bg-primary/5 border-primary/20' : 'border-border hover:bg-muted/30'
                  }`}
                  onClick={(event) => {
                    // Only handle clicks on the row, not on the select dropdown
                    if ((event.target as HTMLElement).closest('[role="combobox"]')) {
                      return;
                    }
                    handleColumnClick(column, index, !isSelected, event);
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    readOnly
                    className="pointer-events-none"
                  />
                  <Label 
                    htmlFor={`type-${column}`} 
                    className="flex-1 font-medium cursor-pointer text-sm pointer-events-none"
                  >
                    {column}
                  </Label>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Select 
                      value={dataTypes[column] || "categorical"} 
                      onValueChange={(value) => onDataTypeChange(column, value)}
                    >
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="categorical">Categorical</SelectItem>
                        <SelectItem value="numerical">Numerical</SelectItem>
                        <SelectItem value="drop">Drop</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DataTypesDefinition;