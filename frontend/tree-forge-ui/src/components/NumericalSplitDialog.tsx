import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NumericalBin } from "@/types";

interface NumericalSplitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (bins: NumericalBin[]) => void;
  variableName: string;
}

const NumericalSplitDialog = ({ isOpen, onClose, onSubmit, variableName }: NumericalSplitDialogProps) => {
  // Sample numerical bins for the selected variable
  const [bins, setBins] = useState<NumericalBin[]>([
    { bin: 1, records: 50, eventRate: 0.2, lowerBound: "0", upperBound: "2.45" },
    { bin: 2, records: 54, eventRate: 0.91, lowerBound: "2.45", upperBound: "4.95" },
    { bin: 3, records: 46, eventRate: 0.02, lowerBound: "4.95", upperBound: "7.0" }
  ]);

  const [tempValues, setTempValues] = useState<{[key: string]: string}>({});
  const [newBinValue, setNewBinValue] = useState<string>("");

  const handleInputChange = (index: number, field: 'lowerBound' | 'upperBound', value: string) => {
    const key = `${index}-${field}`;
    setTempValues(prev => ({ ...prev, [key]: value }));
  };

  const handleBoundChange = (index: number, field: 'lowerBound' | 'upperBound', value: string) => {
    const key = `${index}-${field}`;
    setTempValues(prev => {
      const newTemp = { ...prev };
      delete newTemp[key];
      return newTemp;
    });

    setBins(prevBins => {
      let updatedBins = [...prevBins];
      
      // Update the current bin
      updatedBins[index] = { ...updatedBins[index], [field]: value };
      
      // Auto-update adjacent bins
      if (field === 'lowerBound') {
        // If changing lower bound, update upper bound of the bin above (previous index)
        if (index > 0) {
          updatedBins[index - 1] = { ...updatedBins[index - 1], upperBound: value };
        }
      } else if (field === 'upperBound') {
        // If changing upper bound, update lower bound of the bin below (next index)
        if (index < updatedBins.length - 1) {
          updatedBins[index + 1] = { ...updatedBins[index + 1], lowerBound: value };
        }
      }
      
      // Auto-eliminate invalid bins (where upperBound <= lowerBound)
      updatedBins = updatedBins.filter(bin => {
        const lower = parseFloat(bin.lowerBound);
        const upper = parseFloat(bin.upperBound);
        return !isNaN(lower) && !isNaN(upper) && upper > lower;
      });
      
      // Reassign bin numbers
      updatedBins = updatedBins.map((bin, i) => ({ ...bin, bin: i + 1 }));
      
      return updatedBins;
    });
  };

  const addBin = () => {
    const splitValue = parseFloat(newBinValue);
    if (isNaN(splitValue)) return;

    setBins(prevBins => {
      // Find which bin contains this value
      const binToSplitIndex = prevBins.findIndex(bin => {
        const lower = parseFloat(bin.lowerBound);
        const upper = parseFloat(bin.upperBound);
        return splitValue > lower && splitValue < upper;
      });

      if (binToSplitIndex === -1) return prevBins; // Value doesn't fall within any bin

      const binToSplit = prevBins[binToSplitIndex];
      const lower = parseFloat(binToSplit.lowerBound);
      const upper = parseFloat(binToSplit.upperBound);

      // Estimate records distribution proportionally
      const totalRange = upper - lower;
      const firstRange = splitValue - lower;
      const secondRange = upper - splitValue;
      
      const firstRecords = Math.round((binToSplit.records * firstRange) / totalRange);
      const secondRecords = binToSplit.records - firstRecords;

      // Create new bins
      const firstBin: NumericalBin = {
        ...binToSplit,
        upperBound: newBinValue,
        records: firstRecords
      };

      const secondBin: NumericalBin = {
        ...binToSplit,
        lowerBound: newBinValue,
        records: secondRecords
      };

      // Replace the original bin with the two new bins
      const newBins = [
        ...prevBins.slice(0, binToSplitIndex),
        firstBin,
        secondBin,
        ...prevBins.slice(binToSplitIndex + 1)
      ];

      // Renumber bins
      return newBins.map((bin, index) => ({ ...bin, bin: index + 1 }));
    });

    setNewBinValue("");
  };

  const handleSubmit = () => {
    onSubmit(bins);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Configure Numerical Split - {variableName}</DialogTitle>
          <DialogDescription>
            Edit the lower and upper bounds for each bin to define the split criteria.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="mb-4 flex gap-2 items-center">
            <Input
              type="number"
              step="0.01"
              placeholder="Enter split value"
              value={newBinValue}
              onChange={(e) => setNewBinValue(e.target.value)}
              className="w-32 h-8 text-sm"
            />
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={addBin}
              disabled={!newBinValue}
            >
              Add Bin
            </Button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Bin</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground"># of Records</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Event Rate</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Lower Bound</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Upper Bound</th>
                </tr>
              </thead>
              <tbody>
                {bins.map((bin, index) => (
                  <tr key={bin.bin} className="border-b border-border hover:bg-accent/50">
                    <td className="p-3 text-sm font-medium">{bin.bin}</td>
                    <td className="p-3 text-sm">{bin.records}</td>
                    <td className="p-3 text-sm">{(bin.eventRate * 100).toFixed(1)}%</td>
                    <td className="p-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={tempValues[`${index}-lowerBound`] ?? bin.lowerBound}
                        onChange={(e) => handleInputChange(index, 'lowerBound', e.target.value)}
                        onBlur={(e) => handleBoundChange(index, 'lowerBound', e.target.value)}
                        className="w-24 h-8 text-sm"
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={tempValues[`${index}-upperBound`] ?? bin.upperBound}
                        onChange={(e) => handleInputChange(index, 'upperBound', e.target.value)}
                        onBlur={(e) => handleBoundChange(index, 'upperBound', e.target.value)}
                        className="w-24 h-8 text-sm"
                      />
                    </td>
                  </tr>
                ))}
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

export default NumericalSplitDialog;