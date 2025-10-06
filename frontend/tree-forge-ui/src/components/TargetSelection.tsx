import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TargetSelectionProps {
  columnNames: string[];
  selectedTarget: string;
  onTargetChange: (value: string) => void;
}

const TargetSelection = ({ columnNames, selectedTarget, onTargetChange }: TargetSelectionProps) => {
  return (
    <Card className="shadow-card border-0">
      <CardHeader>
        <CardTitle>Select Target Variable</CardTitle>
        <CardDescription>
          Choose the variable you want to predict with your decision tree
        </CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
};

export default TargetSelection;