import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoricalValue } from "@/types";

interface CategoricalSplitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (groups: CategoricalValue[][]) => void;
  variableName: string;
}

const CategoricalSplitDialog = ({ isOpen, onClose, onSubmit, variableName }: CategoricalSplitDialogProps) => {
  // Sample categorical values
  const [values, setValues] = useState<CategoricalValue[]>([
    { id: '1', value: 'setosa', records: 50, eventRate: 1.0, binNumber: 1, isMerged: false },
    { id: '2', value: 'versicolor', records: 50, eventRate: 0.94, binNumber: 2, isMerged: true },
    { id: '3', value: 'virginica', records: 50, eventRate: 0.96, binNumber: 2, isMerged: true },
    { id: '4', value: 'unknown', records: 25, eventRate: 0.32, binNumber: 3, isMerged: false }
  ]);

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const handleRowSelection = (id: string) => {
    const newSelection = new Set(selectedRows);
    
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    
    setSelectedRows(newSelection);
  };

  const handleMergedGroupSelection = (group: CategoricalValue[]) => {
    const newSelection = new Set(selectedRows);
    const groupIds = group.map(v => v.id);
    const allSelected = groupIds.every(id => selectedRows.has(id));
    
    if (allSelected) {
      // Deselect all in group
      groupIds.forEach(id => newSelection.delete(id));
    } else {
      // Select all in group
      groupIds.forEach(id => newSelection.add(id));
    }
    
    setSelectedRows(newSelection);
  };

  const handleMerge = () => {
    if (selectedRows.size < 2) return;

    // Get all current bin numbers and find the next available one
    const usedBinNumbers = new Set(values.map(v => v.binNumber).filter(Boolean));
    let newBinNumber = 1;
    while (usedBinNumbers.has(newBinNumber)) {
      newBinNumber++;
    }

    setValues(prevValues =>
      prevValues.map(value =>
        selectedRows.has(value.id)
          ? { ...value, binNumber: newBinNumber, isMerged: true }
          : value
      )
    );
    setSelectedRows(new Set());
    
    // Reassign bin numbers starting from 1
    reassignBinNumbers();
  };

  const handleUnmerge = () => {
    if (selectedRows.size === 0) return;

    const usedBinNumbers = new Set(values.map(v => v.binNumber).filter(Boolean));
    let nextBinNumber = 1;
    while (usedBinNumbers.has(nextBinNumber)) {
      nextBinNumber++;
    }

    setValues(prevValues =>
      prevValues.map(value => {
        if (selectedRows.has(value.id) && value.isMerged) {
          const assignedBin = nextBinNumber++;
          usedBinNumbers.add(assignedBin);
          return { ...value, binNumber: assignedBin, isMerged: false };
        }
        return value;
      })
    );
    setSelectedRows(new Set());
    
    // Reassign bin numbers starting from 1
    reassignBinNumbers();
  };

  const reassignBinNumbers = () => {
    setTimeout(() => {
      setValues(prevValues => {
        const groups = new Map<number, CategoricalValue[]>();
        prevValues.forEach(value => {
          const binNumber = value.binNumber || 0;
          if (!groups.has(binNumber)) {
            groups.set(binNumber, []);
          }
          groups.get(binNumber)!.push(value);
        });

        const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a - b);
        const updatedValues: CategoricalValue[] = [];
        
        sortedGroups.forEach(([_, group], index) => {
          const newBinNumber = index + 1;
          group.forEach(value => {
            updatedValues.push({ ...value, binNumber: newBinNumber });
          });
        });

        return updatedValues;
      });
    }, 0);
  };

  const getGroupedValues = () => {
    const groups = new Map<number, CategoricalValue[]>();
    values.forEach(value => {
      const binNumber = value.binNumber || 0;
      if (!groups.has(binNumber)) {
        groups.set(binNumber, []);
      }
      groups.get(binNumber)!.push(value);
    });
    return Array.from(groups.values());
  };

  const renderMergedRow = (group: CategoricalValue[], binNumber: number) => {
    const totalRecords = group.reduce((sum, v) => sum + v.records, 0);
    const avgEventRate = group.reduce((sum, v) => sum + (v.eventRate * v.records), 0) / totalRecords;
    const allSelected = group.every(v => selectedRows.has(v.id));
    
    return group.map((value, index) => (
      <tr key={value.id} className="border-b border-border bg-accent/20">
        {index === 0 && (
          <>
            <td className="p-3 text-sm font-medium align-middle" rowSpan={group.length}>
              {binNumber}
            </td>
            <td className="p-3 text-sm font-medium align-middle" rowSpan={group.length}>
              {totalRecords}
            </td>
            <td className="p-3 text-sm font-medium align-middle" rowSpan={group.length}>
              {(avgEventRate * 100).toFixed(1)}%
            </td>
            <td className="p-3 text-sm align-middle" rowSpan={group.length}>
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => handleMergedGroupSelection(group)}
                />
              </div>
            </td>
          </>
        )}
        <td className="p-3 text-sm">
          {value.value}
        </td>
      </tr>
    ));
  };

  const handleSubmit = () => {
    const groups = getGroupedValues();
    onSubmit(groups);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Configure Categorical Split - {variableName}</DialogTitle>
          <DialogDescription>
            Select rows using checkboxes to merge or unmerge categories.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="mb-4 flex gap-2">
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={handleMerge}
              disabled={selectedRows.size < 2}
            >
              Merge Selected
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={handleUnmerge}
              disabled={selectedRows.size === 0}
            >
              Unmerge Selected
            </Button>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto border border-border rounded-lg">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Bin</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground"># of Records</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Event Rate</th>
                  <th className="text-center p-3 text-sm font-medium text-muted-foreground">Select</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Value</th>
                </tr>
              </thead>
              <tbody>
                {getGroupedValues().map((group, groupIndex) => {
                  const binNumber = group[0].binNumber || 0;
                  
                  if (group.length > 1 && group[0].isMerged) {
                    return renderMergedRow(group, binNumber);
                  }
                  
                   return group.map((value) => (
                     <tr 
                       key={value.id} 
                       className={`border-b border-border hover:bg-accent/50 ${
                         selectedRows.has(value.id) ? 'bg-accent' : ''
                       }`}
                     >
                       <td className="p-3 text-sm font-medium">{value.binNumber}</td>
                       <td className="p-3 text-sm">{value.records}</td>
                       <td className="p-3 text-sm">{(value.eventRate * 100).toFixed(1)}%</td>
                       <td className="p-3 text-sm">
                         <div className="flex items-center justify-center">
                           <Checkbox
                             checked={selectedRows.has(value.id)}
                             onCheckedChange={() => handleRowSelection(value.id)}
                           />
                         </div>
                       </td>
                       <td className="p-3 text-sm">
                         {value.value}
                       </td>
                     </tr>
                   ));
                })}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button type="button" variant="outline">
            Calculate
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="button" 
              onClick={handleSubmit}
              className="bg-gradient-primary hover:shadow-elegant transition-all duration-300"
            >
              Submit
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CategoricalSplitDialog;