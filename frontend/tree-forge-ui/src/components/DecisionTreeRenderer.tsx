import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { hierarchy, tree, cluster } from 'd3-hierarchy';
import { select } from 'd3-selection';
import { NodeMasterData, ColorConfig } from '@/types';
import TreeNodeContextMenu from './TreeNodeContextMenu';
import ForceSplitDialog from './ForceSplitDialog';
import EditSplitDialog from './EditSplitDialog';
import AddLabelDialog from './AddLabelDialog';
import { apiService } from '@/services/api';

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
}

const DecisionTreeRenderer: React.FC<DecisionTreeRendererProps> = ({ 
  nodeMaster, 
  zoom = 1, 
  expandedNodes, 
  onToggleNodeExpansion,
  colorConfig = { mode: 'solid', color1: '#ffffff', color2: '#ffffff' },
  onTreeRefresh
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
      console.log(`Force split completed for node ${forceSplitDialog.nodeNumber} with variable: ${selectedVariable}`);
      
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
      console.log(`Edit split completed for node ${editSplitDialog.nodeNumber} with variable: ${selectedVariable}`);
      
      // Close the dialog
      handleEditSplitDialogClose();
      
      // Refresh the tree after edit split
      onTreeRefresh();
      
    } catch (error) {
      console.error('Error during edit split:', error);
    }
  };

  const handleContextMenuAction = async (action: string) => {
    console.log(`Context menu action: ${action} on node ${contextMenu.nodeNumber}`);
    
    if (!contextMenu.nodeNumber) {
      console.error('No node number available for action');
      return;
    }

    // Handle different actions here
    switch (action) {
      case 'auto-train':
        try {
          console.log(`Starting auto train for node ${contextMenu.nodeNumber}`);
          
          // First call delSubTree
          console.log('Calling /api/delSubTree...');
          const delResponse = await apiService.delSubTree(contextMenu.nodeNumber);
          console.log('delSubTree response:', delResponse);
          
          // Then call autoTrainSubTree
          console.log('Calling /api/autoTrainSubTree...');
          const trainResponse = await apiService.autoTrainSubTree(contextMenu.nodeNumber);
          console.log('autoTrainSubTree response:', trainResponse);
          
        } catch (error) {
          console.error('Error during auto train:', error);
          // TODO: Show error message to user
        } finally {
          // Always refresh the tree data to show the new structure
          if (onTreeRefresh) {
            console.log('Refreshing tree data...');
            onTreeRefresh();
          }
        }
        break;
      case 'find-split':
        try {
          console.log(`Starting find split for node ${contextMenu.nodeNumber}`);
          
          // Call findSplit API
          console.log('Calling /api/findSplit...');
          const findSplitResponse = await apiService.findSplit(contextMenu.nodeNumber);
          console.log('findSplit response:', findSplitResponse);
          
        } catch (error) {
          console.error('Error during find split:', error);
          // TODO: Show error message to user
        } finally {
          // Always refresh the tree data to show the updated structure
          if (onTreeRefresh) {
            console.log('Refreshing tree data after find split...');
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
          console.log(`Starting delete sub tree for node ${contextMenu.nodeNumber}`);
          
          // Call delSubTree API
          console.log('Calling /api/delSubTree...');
          const delResponse = await apiService.delSubTree(contextMenu.nodeNumber);
          console.log('delSubTree response:', delResponse);
          
        } catch (error) {
          console.error('Error during delete sub tree:', error);
          // TODO: Show error message to user
        } finally {
          // Always refresh the tree data to show the updated structure
          if (onTreeRefresh) {
            console.log('Refreshing tree data after delete...');
            onTreeRefresh();
          }
        }
        break;
      case 'copy-subtree':
        try {
          console.log(`Copying sub tree from node ${contextMenu.nodeNumber}`);
          setCopiedNodeNumber(contextMenu.nodeNumber);
          console.log(`Node ${contextMenu.nodeNumber} copied to memory`);
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
          
          console.log(`Pasting sub tree from node ${copiedNodeNumber} to node ${contextMenu.nodeNumber}`);
          
          // First call delSubTree to clear the target node's existing subtree
          console.log('Calling /api/delSubTree...');
          const delResponse = await apiService.delSubTree(contextMenu.nodeNumber);
          console.log('delSubTree response:', delResponse);
          
          // Then call copyNode API to paste the copied subtree
          console.log('Calling /api/copyNode...');
          const copyNodeResponse = await apiService.copyNode(copiedNodeNumber, contextMenu.nodeNumber);
          console.log('copyNode response:', copyNodeResponse);
          
        } catch (error) {
          console.error('Error during paste sub tree:', error);
          // TODO: Show error message to user
        } finally {
          // Always refresh the tree data to show the updated structure
          if (onTreeRefresh) {
            console.log('Refreshing tree data after paste...');
            onTreeRefresh();
          }
        }
        break;
      default:
        console.log(`Unknown action: ${action}`);
    }
  };

  // Helper function to calculate node color based on configuration and event rate
  const getNodeColor = (eventRate: number) => {
    // Helper function to convert hex to rgba
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 255, g: 255, b: 255 };
    };

    switch (colorConfig.mode) {
      case 'solid':
        const solidRgb = hexToRgb(colorConfig.color1);
        return `rgba(${solidRgb.r}, ${solidRgb.g}, ${solidRgb.b}, 0.5)`; // 50% transparency
      
      case 'split':
        return {
          primary: colorConfig.color1,
          secondary: '#ffffff', // Always use white as secondary color
          splitPercentage: eventRate * 100
        };
      
      case 'gradient':
        const gradientRgb = hexToRgb(colorConfig.color1);
        const transparency = 0.1 + (eventRate * 0.8); // Varies from 0.1 to 0.9 based on event rate for greater contrast
        return `rgba(${gradientRgb.r}, ${gradientRgb.g}, ${gradientRgb.b}, ${transparency})`;
      
      default:
        return '#ffffff';
    }
  };

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
        children = nodeMaster
          .filter(child => child.parent_node === nodeData.node_number)
          .map(buildTree);
      }

      return {
        data: nodeData,
        children: children.length > 0 ? children : undefined
      };
    };

    return buildTree(rootNode);
  }, [nodeMaster, expandedNodes]);

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
    const levelGroups: any[][] = [];
    
    // Group nodes by depth (bottom to top)
    for (let i = maxDepth; i >= 0; i--) {
      levelGroups[i] = root.descendants().filter(d => d.depth === i);
    }
    
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
    const allNodes = root.descendants();
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
    const hasChildren = !isLeaf && nodeMaster.some(child => child.parent_node === nodeData.node_number);
    const isExpanded = expandedNodes.has(nodeData.node_number);
    
    const eventRate = nodeData.event_rate || 0;
    const eventRatePercent = (eventRate * 100).toFixed(1);
    const count = nodeData.count || 0;
    const events = nodeData.events || 0;
    const nonEvents = nodeData.non_events || 0;

    const x = node.x + svgDimensions.offsetX;
    const y = node.y + svgDimensions.offsetY;
    const nodeColor = getNodeColor(eventRate);

    return (
      <g 
        key={nodeData.node_number || Math.random()}
        onContextMenu={(e) => handleNodeRightClick(e, nodeData.node_number)}
        className="cursor-context-menu"
      >
        {/* Node rectangle */}
        {colorConfig.mode === 'split' && typeof nodeColor === 'object' ? (
          // Split color mode - render two rectangles with straight line split
          <>
            {/* Primary color rectangle (left side) - no rounded corners */}
            <rect
              x={x}
              y={y}
              width={(nodeColor.splitPercentage / 100) * 200}
              height={120}
              fill={nodeColor.primary}
              stroke="none"
            />
            {/* Secondary color rectangle (right side) - no rounded corners */}
            <rect
              x={x + (nodeColor.splitPercentage / 100) * 200}
              y={y}
              width={200 - (nodeColor.splitPercentage / 100) * 200}
              height={120}
              fill={nodeColor.secondary}
              stroke="none"
            />
            {/* Border around entire node - with rounded corners */}
            <rect
              x={x}
              y={y}
              width={200}
              height={120}
              rx={8}
              ry={8}
              fill="none"
              stroke={colorConfig.color1 === '#ffffff' ? 'hsl(0 65% 51%)' : colorConfig.color1}
              strokeWidth="1"
            />
          </>
        ) : (
          // Solid or gradient color mode
          <rect
            x={x}
            y={y}
            width={200}
            height={120}
            rx={8}
            ry={8}
            fill={typeof nodeColor === 'string' ? nodeColor : '#ffffff'}
            stroke={colorConfig.color1 === '#ffffff' ? 'hsl(0 65% 51%)' : colorConfig.color1}
            strokeWidth="1"
            className="drop-shadow-sm"
          />
        )}

        {/* Node number - smaller font */}
        <text
          x={x + 100}
          y={y + 20}
          textAnchor="middle"
          className="text-xs font-medium fill-slate-600"
        >
          Node {nodeData.node_number || 'N/A'}
        </text>


            {/* Variable: list_values */}
            {nodeData.variable && nodeData.list_values && nodeData.node_number !== 1 && (() => {
              // Convert list_values to string for consistent handling
              let listValuesStr = Array.isArray(nodeData.list_values) 
                ? nodeData.list_values.join('') 
                : String(nodeData.list_values);
              
              // Add "Missing" to the display text if missing = 1 for categorical variables
              if (nodeData.missing === 1) {
                listValuesStr = 'Missing' + (listValuesStr ? ', ' + listValuesStr : '');
              }
              
              // Check if the combined string (including Missing) is longer than 30 characters
              const isLong = listValuesStr.length > 30;
              const displayText = isLong ? listValuesStr.substring(0, 30) + '...' : listValuesStr;
              
              return (
                <g>
                  <text
                    x={x + 100}
                    y={y + 38}
                    textAnchor="middle"
                    className="text-xs font-medium fill-slate-700"
                  >
                    {nodeData.variable}: {displayText}
                  </text>
                  {/* Invisible hover area for tooltip */}
                  {isLong && (
                    <rect
                      x={x + 50}
                      y={y + 20}
                      width="100"
                      height="20"
                      fill="transparent"
                      className="cursor-help"
                      onMouseEnter={(e) => {
                        const tooltip = document.createElement('div');
                        tooltip.id = `tooltip-${nodeData.node_number}`;
                        tooltip.className = 'fixed bg-gray-900 text-white text-xs px-3 py-2 rounded shadow-lg z-50 max-w-xs break-words pointer-events-none';
                        
                        // Format tooltip content with variable name at top and list_values on separate lines
                        let tooltipContent = `${nodeData.variable}:`;
                        
                        // Add "Missing" as a separate line if missing = 1
                        if (nodeData.missing === 1) {
                          tooltipContent += `\nMissing`;
                        }
                        
                        // Add list_values on separate lines
                        if (Array.isArray(nodeData.list_values)) {
                          nodeData.list_values.forEach(value => {
                            // Skip "Missing" values since we handle it separately above
                            if (value !== 'Missing') {
                              tooltipContent += `\n${value}`;
                            }
                          });
                        } else {
                          // For string format, remove "Missing" if present since we handle it separately above
                          const cleanListValues = String(nodeData.list_values).replace(/Missing,\s*/g, '');
                          if (cleanListValues) {
                            tooltipContent += `\n${cleanListValues}`;
                          }
                        }
                        
                        tooltip.textContent = tooltipContent;
                        tooltip.style.left = `${e.clientX + 10}px`;
                        tooltip.style.top = `${e.clientY - 10}px`;
                        tooltip.style.whiteSpace = 'pre-line';
                        document.body.appendChild(tooltip);
                      }}
                      onMouseLeave={() => {
                        const tooltip = document.getElementById(`tooltip-${nodeData.node_number}`);
                        if (tooltip) {
                          document.body.removeChild(tooltip);
                        }
                      }}
                      onMouseMove={(e) => {
                        const tooltip = document.getElementById(`tooltip-${nodeData.node_number}`);
                        if (tooltip) {
                          tooltip.style.left = `${e.clientX + 10}px`;
                          tooltip.style.top = `${e.clientY - 10}px`;
                        }
                      }}
                    />
                  )}
                </g>
              );
            })()}

        {/* Records count - with blank line spacing */}
        <text
          x={x + 100}
          y={y + 60}
          textAnchor="middle"
          className="text-xs font-medium fill-slate-700"
        >
          # of records: {count.toLocaleString()}
        </text>

        {/* Event rate */}
        <text
          x={x + 100}
          y={y + 80}
          textAnchor="middle"
          className="text-xs font-medium fill-slate-700"
        >
          Event rate: {eventRatePercent}%
        </text>

        {/* Node label - at the bottom */}
        {nodeData.node_label && (
          <text
            x={x + 100}
            y={y + 100}
            textAnchor="middle"
            className="text-xs font-bold fill-blue-600"
          >
            {nodeData.node_label}
          </text>
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
          isParentNode={contextMenu.nodeNumber ? nodeMaster.some(node => node.parent_node === contextMenu.nodeNumber) : false}
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