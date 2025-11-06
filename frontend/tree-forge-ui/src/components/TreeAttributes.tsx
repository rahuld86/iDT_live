import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { TreeAttributes } from "@/types";

interface TreeAttributesProps {
  attributes: TreeAttributes;
  onAttributeChange: (key: string, value: string) => void;
  regressionFlag?: number; // 0 = classification, 1 = regression
}

const TreeAttributes = ({ attributes, onAttributeChange, regressionFlag = 0 }: TreeAttributesProps) => {
  // Ensure criteria is RMSE in regression mode
  useEffect(() => {
    if (regressionFlag === 1 && attributes.criteria.toLowerCase() !== 'rmse') {
      onAttributeChange('criteria', 'rmse');
    }
  }, [regressionFlag]);
  return (
    <TooltipProvider>
      <Card className="shadow-card border-0">
        <CardHeader>
          <CardTitle>Define Tree Attributes</CardTitle>
          <CardDescription>
            Configure the parameters for your decision tree algorithm
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                onChange={(e) => onAttributeChange('maxDepth', e.target.value)}
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
                onChange={(e) => onAttributeChange('minNodeSplit', e.target.value)}
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
                onChange={(e) => onAttributeChange('minLeafSize', e.target.value)}
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
                onChange={(e) => onAttributeChange('maxBranches', e.target.value)}
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
              {regressionFlag === 1 ? (
                <Select value={attributes.criteria} onValueChange={(value) => onAttributeChange('criteria', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rmse">RMSE</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Select value={attributes.criteria} onValueChange={(value) => onAttributeChange('criteria', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entropy">Entropy</SelectItem>
                    <SelectItem value="gini">Gini</SelectItem>
                  </SelectContent>
                </Select>
              )}
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
              <Select value={attributes.uniqueVar} onValueChange={(value) => onAttributeChange('uniqueVar', value)}>
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
                <Label htmlFor="monotonic-splits">Monotonic Splits</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>1 if the splits should rank order</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select value={attributes.monotonicSplits} onValueChange={(value) => onAttributeChange('monotonicSplits', value)}>
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
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default TreeAttributes;