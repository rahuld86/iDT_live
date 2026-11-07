import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { hierarchy } from 'd3-hierarchy';
import { NodeMasterData, ColorConfig } from '@/types';
import TreeNodeContextMenu from './TreeNodeContextMenu';
import ForceSplitDialog from './ForceSplitDialog';
import EditSplitDialog from './EditSplitDialog';
import AddLabelDialog from './AddLabelDialog';
import { apiService } from '@/services/api';
import { formatContinuousRange, indexChildren, truncateText } from '@/lib/tree-utils';

interface TreeNode {
  data: NodeMasterData;
  children?: TreeNode[];
  x?: number;
  y?: number;
}

interface DecisionTreeRendererProps {
  nodeMaster: NodeMasterData[];
  zoom?: number;
  expandedNodes: Set<number>;
  onToggleNodeExpansion: (nodeNumber: number) => void;
  colorConfig?: ColorConfig;
  onTreeRefresh?: () => void;
  regressionFlag?: number; // 0 = Binary Classification, 1 = Regression
}

const DecisionTreeRenderer: React.FC<DecisionTreeRendererProps> = ({ 
  nodeMaster, 
  zoom = 1, 
  expandedNodes, 
  onToggleNodeExpansion,
  colorConfig = { mode: 'split', color1: '#ef4444', color2: '#ffffff' },
  onTreeRefresh,
  regressionFlag = 0
}) => {
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    nodeNumber: number | null;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    nodeNumber: null
  });

  // Copy/paste state
  const [copiedNodeNumber, setCopiedNodeNumber] = useState<number | null>(null);

  // Force split dialog state
  const [forceSplitDialog, setForceSplitDialog] = useState<{
    isOpen: boolean;
    nodeNumber: number | null;
  }>({
    isOpen: false,
    nodeNumber: null
  });

  // Edit split dialog state
  const [editSplitDialog, setEditSplitDialog] = useState<{
    isOpen: boolean;
    nodeNumber: number | null;
    variableName: string;
  }>({
    isOpen: false,
    nodeNumber: null,
    variableName: '',
  });

  // Add label dialog state
  const [addLabelDialog, setAddLabelDialog] = useState<{
    isOpen: boolean;
    nodeNumber: number | null;
    existingLabel: string | null;
  }>({
    isOpen: false,
    nodeNumber: null,
    existingLabel: null,
  });

  // Cleanup tooltips on component unmount
  useEffect(() => {
    return () => {
      // Clean up any remaining tooltips when component unmounts
      const tooltips = document.querySelectorAll('[id^="tooltip-"]');
      tooltips.forEach(tooltip => {
        if (tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
      });
    };
  }, []);

  // Context menu handlers
  const handleNodeRightClick = (event: React.MouseEvent, nodeNumber: number) => {
    event.preventDefault();
    event.stopPropagation();
    
    setContextMenu({
      isOpen: true,
      position: { x: event.clientX, y: event.clientY },
      nodeNumber
    });
  };

  const handleContextMenuClose = () => {
    setContextMenu({
      isOpen: false,
      position: { x: 0, y: 0 },
      nodeNumber: null
    });
  };

  // Force split dialog handlers
  const handleForceSplitDialogClose = () => {
    setForceSplitDialog({
      isOpen: false,
      nodeNumber: null
    });
  };

  // Edit split dialog handlers
  const handleEditSplitDialogClose = () => {
    setEditSplitDialog({
      isOpen: false,
      nodeNumber: null,
      variableName: ''
    });
  };

  // Add label dialog handlers
  const handleAddLabelDialogClose = () => {
    setAddLabelDialog({
      isOpen: false,
      nodeNumber: null,
      existingLabel: null
    });
  };

  const handleLabelAdded = () => {
    // Close the dialog
    handleAddLabelDialogClose();
    
    // Refresh the tree after adding label
    onTreeRefresh();
  };

  const handleForceSplit = async (selectedVariable: string) => {
    if (!forceSplitDialog.nodeNumber) {
      console.error('No node number available for force split');
      return;
    }

    try {
      
      // Close the dialog
      handleForceSplitDialogClose();
      
      // Refresh the tree after force split
      onTreeRefresh();
      
    } catch (error) {
      console.error('Error during force split:', error);
    }
  };

  const handleEditSplit = async (selectedVariable: string) => {
    if (!editSplitDialog.nodeNumber) {
      console.error('No node number available for edit split');
      return;
    }

    try {
      
      // Close the dialog
      handleEditSplitDialogClose();
      
      // Refresh the tree after edit split
      onTreeRefresh();
      
    } catch (error) {
      console.error('Error during edit split:', error);
    }
  };

  const handleContextMenuAction = async (action: string) => {
    
    if (!contextMenu.nodeNumber) {
      console.error('No node number available for action');
      return;
    }

    // Handle different actions here
    switch (action) {
      case 'auto-train':
        try {
          
          // First call delSubTree
          const delResponse = await apiService.delSubTree(contextMenu.nodeNumber);
          
          // Then call autoTrainSubTree
          const trainResponse = await apiService.autoTrainSubTree(contextMenu.nodeNumber);
          
        } catch (error) {
          console.error('Error during auto train:', error);
          // TODO: Show error message to user
        } finally {
          // Always refresh the tree data to show the new structure
          if (onTreeRefresh) {
            onTreeRefresh();
          }
        }
        break;
      case 'find-split':
        try {
          
          // Call findSplit API
          const findSplitResponse = await apiService.findSplit(contextMenu.nodeNumber);
          
        } catch (error) {
          console.error('Error during find split:', error);
          // TODO: Show error message to user
        } finally {
          // Always refresh the tree data to show the updated structure
          if (onTreeRefresh) {
            onTreeRefresh();
          }
        }
        break;
      case 'force-split':
        // Open force split dialog
        setForceSplitDialog({
          isOpen: true,
          nodeNumber: contextMenu.nodeNumber
        });
        break;
      case 'edit-split':
        // Get the variable name from the child nodes (the actual variable being split on)
        const childNodes = nodeMaster.filter(node => node.parent_node === contextMenu.nodeNumber);
        if (childNodes.length > 0 && childNodes[0].variable) {
          // Open edit split dialog with the child node's variable name
          setEditSplitDialog({
            isOpen: true,
            nodeNumber: contextMenu.nodeNumber,
            variableName: childNodes[0].variable
          });
        } else {
          console.error('No child nodes or variable found for node', contextMenu.nodeNumber);
        }
        break;
      case 'add-label':
        // Find the node data to get existing label
        const nodeData = nodeMaster.find(node => node.node_number === contextMenu.nodeNumber);
        // Open add label dialog
        setAddLabelDialog({
          isOpen: true,
          nodeNumber: contextMenu.nodeNumber,
          existingLabel: nodeData?.node_label || null
        });
        break;
      case 'delete-subtree':
        try {
          
          // Call delSubTree API
          const delResponse = await apiService.delSubTree(contextMenu.nodeNumber);
          
        } catch (error) {
          console.error('Error during delete sub tree:', error);
          // TODO: Show error message to user
        } finally {
          // Always refresh the tree data to show the updated structure
          if (onTreeRefresh) {
            onTreeRefresh();
          }
        }
        break;
      case 'copy-subtree':
        try {
          setCopiedNodeNumber(contextMenu.nodeNumber);
        } catch (error) {
          console.error('Error during copy sub tree:', error);
        }
        break;
      case 'paste-subtree':
        try {
          if (!copiedNodeNumber) {
            console.error('No node copied. Please copy a node first.');
            return;
          }
          
          
          // First call delSubTree to clear the target node's existing subtree
          const delResponse = await apiService.delSubTree(contextMenu.nodeNumber);
          
          // Then call copyNode API to paste the copied subtree
          const copyNodeResponse = await apiService.copyNode(copiedNodeNumber, contextMenu.nodeNumber);
          
        } catch (error) {
          console.error('Error during paste sub tree:', error);
          // TODO: Show error message to user
        } finally {
          // Always refresh the tree data to show the updated structure
          if (onTreeRefresh) {
            onTreeRefresh();
          }
        }
        break;
      default:
    }
  };

  // Compute normalization range for regression 'average' values
  const regressionRange = useMemo(() => {
    if (regressionFlag !== 1 || !nodeMaster || nodeMaster.length === 0) {
      return { min: 0, max: 1 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const n of nodeMaster) {
      const v = typeof n.event_rate === 'number' ? n.event_rate : Number(n.event_rate);
      if (!isNaN(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!isFinite(min) || !isFinite(max) || min === max) {
      // Fallback to a sensible range to avoid NaN colors
      return { min: 0, max: min === max ? (min || 1) : 1 };
    }
    return { min, max };
  }, [nodeMaster, regressionFlag]);

  const normalizeValue = (raw: number) => {
    if (regressionFlag !== 1) return raw; // already 0..1 for classification
    const v = Number(raw);
    if (!isFinite(v)) return 0.5;
    const { min, max } = regressionRange;
    const span = max - min;
    if (!isFinite(span) || span === 0) return 0.5;
    const norm = (v - min) / span;
    // Clamp to [0,1]
    return Math.max(0, Math.min(1, norm));
  };

  const primaryRgb = useMemo(() => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorConfig.color1);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }, [colorConfig.color1]);

  // Helper function to calculate node color based on configuration and metric
  const getNodeColor = (rawValue: number) => {
    const value = normalizeValue(rawValue);

    switch (colorConfig.mode) {
      case 'solid':
        return `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.5)`; // 50% transparency
      
      case 'split':
        return {
          primary: colorConfig.color1,
          secondary: '#ffffff', // Always use white as secondary color
          splitPercentage: value * 100
        };
      
      case 'gradient':
        const transparency = 0.1 + (value * 0.8); // Varies from 0.1 to 0.9 based on normalized value
        return `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, ${transparency})`;
      
      default:
        return '#ffffff';
    }
  };

  const childrenByParent = useMemo(() => indexChildren(nodeMaster), [nodeMaster]);

  // Build tree structure from node_master data with expand/collapse filtering
  const treeStructure = useMemo(() => {
    if (!nodeMaster || nodeMaster.length === 0) return null;

    // Find root node (node_number = 1)
    const rootNode = nodeMaster.find(node => node.node_number === 1);
    if (!rootNode) return null;

    // Build tree recursively with expand/collapse filtering
    const buildTree = (nodeData: NodeMasterData): TreeNode => {
      const isExpanded = expandedNodes.has(nodeData.node_number);
      
      let children: TreeNode[] = [];
      if (isExpanded) {
        children = (childrenByParent.get(nodeData.node_number) || []).map(buildTree);
      }

      return {
        data: nodeData,
        children: children.length > 0 ? children : undefined
      };
    };

    return buildTree(rootNode);
  }, [nodeMaster, expandedNodes, childrenByParent]);

  // Use recursive subtree layout with dedicated space allocation
  const layoutData = useMemo(() => {
    if (!treeStructure) return null;

    // Create d3 hierarchy
    const root = hierarchy(treeStructure, d => d.children);
    
    const nodeWidth = 200;
    const nodeHeight = 120;
    const minSeparation = 300; // Generous separation - space is not a concern
    const levelHeight = 200; // Vertical spacing between levels
    
    // Recursive function to calculate subtree widths and assign positions
    const calculateSubtreeLayout = (node: any, startX: number, level: number): number => {
      if (!node.children || node.children.length === 0) {
        // Leaf node - just position it
        node.x = startX;
        node.y = level * levelHeight;
        return nodeWidth;
      }
      
      // Calculate total width needed for all children
      let totalChildrenWidth = 0;
      const childWidths: number[] = [];
      
      // First pass: calculate width needed for each child subtree
      for (let i = 0; i < node.children.length; i++) {
        const childWidth = calculateSubtreeLayout(
          node.children[i], 
          startX + totalChildrenWidth, 
          level + 1
        );
        childWidths.push(childWidth);
        totalChildrenWidth += childWidth;
        
        // Add separation between children (except for the last one)
        if (i < node.children.length - 1) {
          totalChildrenWidth += minSeparation;
        }
      }
      
      // Position the current node in the center of its children
      const childrenStartX = startX;
      const childrenEndX = startX + totalChildrenWidth;
      node.x = (childrenStartX + childrenEndX) / 2;
      node.y = level * levelHeight;
      
      return Math.max(nodeWidth, totalChildrenWidth);
    };
    
    // Calculate the total width needed for the entire tree
    const totalTreeWidth = calculateSubtreeLayout(root, 0, 0);
    
    // Now perform bottom-to-top spacing adjustment
    const maxDepth = root.height;
    const allNodes = root.descendants();
    const levelGroups: any[][] = Array.from({ length: maxDepth + 1 }, () => []);
    
    // Group nodes by depth (bottom to top)
    for (const node of allNodes) levelGroups[node.depth].push(node);
    
    // Bottom-to-top pass: adjust spacing starting from leaf nodes
    for (let level = maxDepth; level >= 0; level--) {
      const levelNodes = levelGroups[level];
      
      if (levelNodes.length > 1) {
        // Sort nodes by x position
        levelNodes.sort((a, b) => (a.x || 0) - (b.x || 0));
        
        // Ensure minimum separation between all nodes at this level
        for (let i = 1; i < levelNodes.length; i++) {
          const prevNode = levelNodes[i - 1];
          const currentNode = levelNodes[i];
          const currentX = currentNode.x || 0;
          const prevX = prevNode.x || 0;
          const requiredX = prevX + minSeparation;
          
          if (currentX < requiredX) {
            // Shift this node and all nodes to its right
            const shiftAmount = requiredX - currentX;
            for (let j = i; j < levelNodes.length; j++) {
              levelNodes[j].x = (levelNodes[j].x || 0) + shiftAmount;
            }
          }
        }
        
        // If this level has children, propagate the spacing changes upward
        if (level > 0) {
          const parentLevel = level - 1;
          const parentNodes = levelGroups[parentLevel];
          
          // Recalculate parent positions based on their children's new positions
          parentNodes.forEach(parent => {
            if (parent.children && parent.children.length > 0) {
              const children = parent.children;
              const leftmostChild = Math.min(...children.map(c => c.x || 0));
              const rightmostChild = Math.max(...children.map(c => c.x || 0));
              parent.x = (leftmostChild + rightmostChild) / 2;
            }
          });
        }
      }
    }
    
    // Final pass: ensure no overlaps with generous spacing
    for (let i = 0; i < allNodes.length; i++) {
      for (let j = i + 1; j < allNodes.length; j++) {
        const node1 = allNodes[i];
        const node2 = allNodes[j];
        
        if (node1.x !== undefined && node1.y !== undefined && 
            node2.x !== undefined && node2.y !== undefined) {
          
          const dx = Math.abs(node1.x - node2.x);
          const dy = Math.abs(node1.y - node2.y);
          
          // Check if nodes are too close (considering node dimensions)
          if (dx < minSeparation && dy < (nodeHeight + 100)) {
            // Adjust the rightmost node
            if (node1.x > node2.x) {
              node1.x = node2.x + minSeparation;
            } else {
              node2.x = node1.x + minSeparation;
            }
          }
        }
      }
    }

    return root;
  }, [treeStructure]);

  // Calculate SVG dimensions based on layout
  const svgDimensions = useMemo(() => {
    if (!layoutData) return { width: 800, height: 600 };

    // Get bounds from layout
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    layoutData.each(node => {
      if (node.x !== undefined && node.y !== undefined) {
        minX = Math.min(minX, node.x);
        maxX = Math.max(maxX, node.x);
        minY = Math.min(minY, node.y);
        maxY = Math.max(maxY, node.y);
      }
    });

    // Add generous padding - space is not a concern
    const padding = 200;
    const nodeWidth = 200;
    const nodeHeight = 120;

    // Calculate dimensions with plenty of space
    const contentWidth = maxX - minX + nodeWidth;
    const contentHeight = maxY - minY + nodeHeight;
    
    const width = Math.max(1500, contentWidth + (padding * 2));
    const height = Math.max(1000, contentHeight + (padding * 2));

    return {
      width,
      height,
      offsetX: -minX + padding,
      offsetY: -minY + padding
    };
  }, [layoutData]);

  // Render connections between nodes with straight lines and steps
  const renderConnections = () => {
    if (!layoutData) return null;

    const connections: JSX.Element[] = [];

    layoutData.each(node => {
      if (node.children) {
        node.children.forEach(child => {
          if (node.x !== undefined && node.y !== undefined && 
              child.x !== undefined && child.y !== undefined) {
            
            const startX = node.x + svgDimensions.offsetX + 100; // Center of parent
            const startY = node.y + svgDimensions.offsetY + 120; // Bottom of parent
            const endX = child.x + svgDimensions.offsetX + 100; // Center of child
            const endY = child.y + svgDimensions.offsetY; // Top of child

            // Create stepped connection (L-shaped)
            // First go down from parent, then horizontally, then down to child
            const stepY = startY + 40; // Distance to step down from parent
            const pathData = `M ${startX} ${startY} L ${startX} ${stepY} L ${endX} ${stepY} L ${endX} ${endY}`;

                const parentData = node.data?.data || node.data;
                const childData = child.data?.data || child.data;
                
                connections.push(
                  <g key={`connection-${parentData?.node_number || 'unknown'}-${childData?.node_number || 'unknown'}`}>
                    <path
                      d={pathData}
                      stroke={colorConfig.color1 === '#ffffff' ? 'hsl(0 65% 51%)' : colorConfig.color1}
                      strokeWidth="2"
                      fill="none"
                      markerEnd="url(#arrowhead)"
                    />
                  </g>
                );
          }
        });
      }
    });

    return connections;
  };

  // Render individual node
  const renderNode = (node: any) => {
    if (node.x === undefined || node.y === undefined) return null;

    // Access data from d3 hierarchy node - the actual data is nested deeper
    const nodeData = node.data?.data || node.data;
    if (!nodeData) return null;

    const isLeaf = nodeData.leaf_flag;
    // Check if this node has children in the original nodeMaster data
    const hasChildren = !isLeaf && childrenByParent.has(nodeData.node_number);
    const isExpanded = expandedNodes.has(nodeData.node_number);
    
    const eventRate = nodeData.event_rate || 0;
    const eventRatePercent = (eventRate * 100).toFixed(1);
    const count = nodeData.count || 0;
    // Format the value based on regression flag
    const displayValue = regressionFlag === 1 
      ? eventRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : eventRatePercent + '%';
    const displayLabel = regressionFlag === 1 ? 'Average' : 'Event rate';

    const x = node.x + svgDimensions.offsetX;
    const y = node.y + svgDimensions.offsetY;
    const nodeColor = getNodeColor(eventRate);

    return (
      <g 
        key={nodeData.node_number || Math.random()}
        onContextMenu={(e) => handleNodeRightClick(e, nodeData.node_number)}
        className="cursor-context-menu"
      >
        {/* Keep the 200 x 120 footprint so connectors and tree layout stay unchanged. */}
        <rect
          x={x} y={y} width={200} height={120} rx={8}
          fill="#ffffff" stroke="#cbd5e1" strokeWidth={1}
          className="drop-shadow-sm"
        />

        {/* Keep the node number on the left, with an optional label on the right. */}
        <text
          x={x + 12} y={y + 22}
          fontSize={12} fontWeight={600}
          fill="#334155"
        >
          <title>{`Node ${nodeData.node_number}`}</title>
          {truncateText(`Node ${nodeData.node_number}`, nodeData.node_label ? 80 : 176, 12)}
        </text>
        {nodeData.node_label && (
          <text x={x + 188} y={y + 22} textAnchor="end" fontSize={11} fontWeight={600} fill="#800020">
            <title>{nodeData.node_label}</title>
            {truncateText(nodeData.node_label, 84, 11)}
          </text>
        )}

        {/* Keep the full variable and rule available in native SVG tooltips. */}
        {nodeData.variable && nodeData.node_number !== 1 && (
          <text x={x + 12} y={y + 43} fontSize={11} fontWeight={600} fill="#334155">
            <title>{nodeData.variable}</title>
            {truncateText(String(nodeData.variable), 176, 11)}
          </text>
        )}
        {nodeData.variable && nodeData.node_number !== 1 && (() => {
          const continuousRange = formatContinuousRange(nodeData.lower_bound, nodeData.upper_bound);
          const rawList = nodeData.list_values
            ? (Array.isArray(nodeData.list_values) ? nodeData.list_values.join(', ') : String(nodeData.list_values))
            : '';
          const rangeOrValues = continuousRange || rawList;
          if (!rangeOrValues && nodeData.missing !== 1) return null;

          const rule = `${nodeData.missing === 1 ? 'Missing' : ''}${nodeData.missing === 1 && rangeOrValues ? ', ' : ''}${rangeOrValues}`;
          return (
            <text x={x + 12} y={y + 58} fontSize={10} fill="#64748b" className="cursor-help">
              <title>{`${nodeData.variable}: ${rule}`}</title>
              {truncateText(rule, 176, 10)}
            </text>
          );
        })()}

        <text x={x + 12} y={y + 79} fontSize={9} fill="#64748b">Records</text>
        <text x={x + 188} y={y + 79} textAnchor="end" fontSize={9} fill="#64748b">
          {displayLabel}
        </text>
        <text x={x + 12} y={y + 97} fontSize={14} fontWeight={600} fill="#1e293b">
          <title>{count.toLocaleString()}</title>
          {truncateText(count.toLocaleString(), 80, 14)}
        </text>
        <text x={x + 188} y={y + 97} textAnchor="end" fontSize={14} fontWeight={600} fill="#1e293b">
          <title>{displayValue}</title>
          {truncateText(displayValue, 80, 14)}
        </text>

        {/* Preserve the existing color modes in an inset strip, away from text. */}
        <rect x={x + 12} y={y + 107} width={176} height={5} rx={2.5} fill="#f1f5f9" />
        {colorConfig.mode === 'split' && typeof nodeColor === 'object' ? (
          <>
            <rect
              x={x + 12} y={y + 107}
              width={(nodeColor.splitPercentage / 100) * 176} height={5}
              fill={nodeColor.primary}
            />
            <rect
              x={x + 12 + (nodeColor.splitPercentage / 100) * 176} y={y + 107}
              width={176 - (nodeColor.splitPercentage / 100) * 176} height={5}
              fill={nodeColor.secondary}
            />
            <rect x={x + 12} y={y + 107} width={176} height={5} rx={2.5} fill="none" stroke="#e2e8f0" strokeWidth={0.5} />
          </>
        ) : (
          <rect
            x={x + 12} y={y + 107} width={176} height={5} rx={2.5}
            fill={typeof nodeColor === 'string' ? nodeColor : '#ffffff'}
          />
        )}

        {/* Expand/Collapse button for parent nodes */}
        {hasChildren && (
          <g>
            {/* Button background */}
            <rect
              x={x + 85}
              y={y + 130}
              width={30}
              height={20}
              rx={4}
              ry={4}
              fill="#ffffff"
              stroke="#64748b"
              strokeWidth="1"
              className="cursor-pointer hover:fill-slate-50"
              onClick={() => onToggleNodeExpansion(nodeData.node_number)}
            />
            
            {/* Plus/Minus icon */}
            {isExpanded ? (
              <g>
                {/* Minus icon */}
                <line
                  x1={x + 94}
                  y1={y + 140}
                  x2={x + 106}
                  y2={y + 140}
                  stroke="#64748b"
                  strokeWidth="2"
                  className="cursor-pointer"
                  onClick={() => onToggleNodeExpansion(nodeData.node_number)}
                />
              </g>
            ) : (
              <g>
                {/* Plus icon */}
                <line
                  x1={x + 94}
                  y1={y + 140}
                  x2={x + 106}
                  y2={y + 140}
                  stroke="#64748b"
                  strokeWidth="2"
                  className="cursor-pointer"
                  onClick={() => onToggleNodeExpansion(nodeData.node_number)}
                />
                <line
                  x1={x + 100}
                  y1={y + 134}
                  x2={x + 100}
                  y2={y + 146}
                  stroke="#64748b"
                  strokeWidth="2"
                  className="cursor-pointer"
                  onClick={() => onToggleNodeExpansion(nodeData.node_number)}
                />
              </g>
            )}
          </g>
        )}
      </g>
    );
  };

  if (!layoutData) {
    return (
      <Card className="shadow-card border-0">
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground">
            No tree data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-card border-0 overflow-hidden">
        <CardContent className="p-4">
          <div className="overflow-auto bg-gradient-to-br from-background to-accent/5 rounded-lg h-[600px]">
            <svg
              width={svgDimensions.width * zoom}
              height={svgDimensions.height * zoom}
              viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
              style={{ 
                display: 'block',
                minWidth: '100%',
                minHeight: '100%'
              }}
            >
              {/* Define arrow marker */}
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 10 3.5, 0 7"
                    fill={colorConfig.color1 === '#ffffff' ? 'hsl(0 65% 51%)' : colorConfig.color1}
                  />
                </marker>
              </defs>

              {/* Render connections first (so they appear behind nodes) */}
              {renderConnections()}

              {/* Render all nodes */}
              {layoutData.descendants().map(renderNode)}
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* Context Menu */}
        <TreeNodeContextMenu
          isOpen={contextMenu.isOpen}
          position={contextMenu.position}
          onClose={handleContextMenuClose}
          onAction={handleContextMenuAction}
          copiedNodeNumber={copiedNodeNumber}
          isParentNode={contextMenu.nodeNumber ? childrenByParent.has(contextMenu.nodeNumber) : false}
        />

      {/* Force Split Dialog */}
      <ForceSplitDialog
        isOpen={forceSplitDialog.isOpen}
        onClose={handleForceSplitDialogClose}
        nodeNumber={forceSplitDialog.nodeNumber || 0}
        onSplit={handleForceSplit}
      />

      {/* Edit Split Dialog */}
      <EditSplitDialog
        isOpen={editSplitDialog.isOpen}
        onClose={handleEditSplitDialogClose}
        nodeNumber={editSplitDialog.nodeNumber || 0}
        variableName={editSplitDialog.variableName}
        nodeMaster={nodeMaster}
        onSplit={handleEditSplit}
      />

      {/* Add Label Dialog */}
      <AddLabelDialog
        isOpen={addLabelDialog.isOpen}
        onClose={handleAddLabelDialogClose}
        nodeNumber={addLabelDialog.nodeNumber || 0}
        existingLabel={addLabelDialog.existingLabel}
        onLabelAdded={handleLabelAdded}
      />
    </>
  );
};

export default DecisionTreeRenderer;
