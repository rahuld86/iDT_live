import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef } from "react";
import TreeNodeContextMenu from "./TreeNodeContextMenu";
import AddLabelDialog from "./AddLabelDialog";
import ForceSplitDialog from "./ForceSplitDialog";
import { useToast } from "@/hooks/use-toast";
import { TreeNodeData, ColorConfig } from "@/types";

interface DecisionTreeNodeProps {
  node: TreeNodeData;
  level: number;
  onUpdateNode: (nodeId: string, updates: Partial<TreeNodeData>) => void;
  colorConfig?: ColorConfig;
}

const getNodeStyle = (eventRate: number, colorConfig?: ColorConfig) => {
  if (!colorConfig || colorConfig.mode === 'solid') {
    return {
      backgroundColor: colorConfig?.color1 || 'hsl(var(--background))',
      border: '1px solid hsl(var(--border))'
    };
  }

  if (colorConfig.mode === 'split') {
    const percentage = eventRate * 100;
    // Create a hard horizontal split with white on the right
    return {
      background: `linear-gradient(to right, ${colorConfig.color1} ${percentage}%, ${colorConfig.color1} ${percentage}%, hsl(var(--background)) ${percentage}%, hsl(var(--background)) 100%)`,
      border: '1px solid hsl(var(--border))'
    };
  }

  if (colorConfig.mode === 'gradient') {
    // Use color 1 with transparency based on event rate, but keep text opaque
    const opacity = eventRate;
    // Convert hex to rgb for rgba usage
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 255, g: 255, b: 255 };
    };
    
    const rgb = hexToRgb(colorConfig.color1);
    
    return {
      backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`,
      border: '1px solid hsl(var(--border))'
    };
  }

  return {
    backgroundColor: 'hsl(var(--background))',
    border: '1px solid hsl(var(--border))'
  };
};

const DecisionTreeNode = ({ node, level, onUpdateNode, colorConfig }: DecisionTreeNodeProps) => {
  const { toast } = useToast();
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
  }>({
    isOpen: false,
    position: { x: 0, y: 0 }
  });
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [showForceSplitDialog, setShowForceSplitDialog] = useState(false);

  // Refs and measurements for connector alignment
  const childrenContainerRef = useRef<HTMLDivElement>(null);
  const [childCenters, setChildCenters] = useState<number[]>([]);

  useEffect(() => {
    const el = childrenContainerRef.current;
    if (!el) { setChildCenters([]); return; }

    const compute = () => {
      const wrappers = Array.from(el.querySelectorAll<HTMLDivElement>(":scope > .child-wrapper"));
      if (wrappers.length === 0) { setChildCenters([]); return; }
      const contRect = el.getBoundingClientRect();
      const centers = wrappers.map(w => {
        const r = w.getBoundingClientRect();
        return r.left - contRect.left + r.width / 2;
      });
      setChildCenters(centers);
    };

    compute();

    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    Array.from(el.children).forEach((child) => ro.observe(child as Element));

    return () => ro.disconnect();
  }, [node.children?.length]);

  const nodeStyle = getNodeStyle(node.eventRate, colorConfig);
  const hasChildren = node.children && node.children.length > 0;

  const handleRightClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    setContextMenu({
      isOpen: true,
      position: { x: event.clientX, y: event.clientY }
    });
  };

  const handleContextMenuClose = () => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  };

  const handleContextMenuAction = (action: string) => {
    if (action === 'add-label') {
      setShowLabelDialog(true);
      return;
    }

    if (action === 'force-split') {
      setShowForceSplitDialog(true);
      return;
    }

    const actions: Record<string, string> = {
      'auto-train': 'Auto training sub tree...',
      'find-split': 'Finding optimal split...',
      'delete-subtree': 'Deleting sub tree...',
      'copy-subtree': 'Sub tree copied to clipboard',
      'paste-subtree': 'Pasting sub tree...'
    };

    toast({
      title: "Node Action",
      description: actions[action] || `Executing ${action}...`,
    });
  };

  const handleLabelSubmit = (label: string) => {
    onUpdateNode(node.id, { customLabel: label });
    toast({
      title: "Label Added",
      description: `Custom label "${label}" added to node.`,
    });
  };

  const handleForceSplitSubmit = (variableName: string) => {
    toast({
      title: "Force Split Applied",
      description: `Node will be split using variable: ${variableName}`,
    });
    // Here you would typically update the node with the new split
  };

  return (
    <div className="flex flex-col items-center animate-fade-in">
      {/* Branch Label */}
      {node.branchLabel && (
        <div className="mb-2">
          <Badge variant="outline" className="text-xs">
            {node.branchLabel}
          </Badge>
        </div>
      )}
      
      {/* Node Card */}
      <Card 
        className="relative min-w-48 max-w-56 shadow-card transition-all duration-300 hover:shadow-elegant hover:scale-105 cursor-pointer"
        style={nodeStyle}
        onContextMenu={handleRightClick}
      >
        <CardContent className="p-4 text-center">
          {/* Condition */}
          {node.condition && (
            <div className="font-semibold text-sm mb-2 text-foreground">
              {node.condition}
            </div>
          )}
          
          {/* Statistics */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground"># of Records:</span>
              <span className="font-medium">{node.records}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Event Rate:</span>
              <span className="font-medium">{(node.eventRate * 100).toFixed(1)}%</span>
            </div>
            <div className="mt-2 pt-2 border-t border-border/50">
              {/* Custom Label or Class Name */}
              <Badge variant={node.customLabel ? "default" : "secondary"} className="text-xs">
                {node.customLabel || node.className}
              </Badge>
            </div>
          </div>
        </CardContent>
        
        {/* Connection Lines */}
        {hasChildren && (
          <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2">
            <div className="w-px h-4 bg-black"></div>
          </div>
        )}
      </Card>

      {/* Context Menu */}
      <TreeNodeContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={handleContextMenuClose}
        onAction={handleContextMenuAction}
      />

      {/* Add Label Dialog */}
      <AddLabelDialog
        isOpen={showLabelDialog}
        onClose={() => setShowLabelDialog(false)}
        onSubmit={handleLabelSubmit}
        currentLabel={node.customLabel}
      />

      {/* Force Split Dialog */}
      <ForceSplitDialog
        isOpen={showForceSplitDialog}
        onClose={() => setShowForceSplitDialog(false)}
        onSubmit={handleForceSplitSubmit}
      />

      {/* Children */}
      {hasChildren && (
        <div className="mt-8 relative">
          {/* Child Nodes container */}
          <div
            ref={childrenContainerRef}
            className="relative flex justify-center items-start"
            style={{ gap: node.children!.length > 3 ? '1rem' : '2rem' }}
          >
            {node.children!.map((child) => (
              <div key={child.id} className="relative flex-shrink-0 child-wrapper">
                {/* Vertical connector */}
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="w-px h-4 bg-black"></div>
                </div>
                <DecisionTreeNode node={child} level={level + 1} onUpdateNode={onUpdateNode} colorConfig={colorConfig} />
              </div>
            ))}

            {/* Horizontal connector and child stems via SVG for pixel-perfect alignment */}
            {childCenters.length > 0 && (
              <svg
                className="absolute"
                style={{ top: -16, left: 0, width: '100%', height: 16, overflow: 'visible' }}
              >
                {/* Horizontal line from first to last center */}
                {childCenters.length > 1 && (
                  <line
                    x1={childCenters[0]}
                    y1={14}
                    x2={childCenters[childCenters.length - 1]}
                    y2={14}
                    stroke="black"
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                )}
                {/* Down stems to each child center */}
                {childCenters.map((x, i) => (
                  <line key={i} x1={x} y1={0} x2={x} y2={14} stroke="black" strokeWidth={1} shapeRendering="crispEdges" />
                ))}
              </svg>
            )}

          </div>
        </div>
      )}
    </div>
  );
};

export default DecisionTreeNode;