import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ZoomIn, ZoomOut, Palette, Camera, Download, Code, ChevronDown, FileText, Database, BarChart3 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import DecisionTreeRenderer from "@/components/DecisionTreeRenderer";
import NodeColorSettings from "@/components/NodeColorSettings";
import TreeAttributesDialog from "@/components/TreeAttributesDialog";
import ExportDialog, { ExportMethod } from "@/components/ExportDialog";
import { ColorConfig, TreeAttributes } from "@/types";
import { apiService } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NodeMasterData {
  node_number: number;
  parent_node: number;
  level: number;
  branch: number | string;
  leaf_flag: boolean;
  count: number;
  events: number;
  non_events: number;
  event_rate: number;
  variable: string;
  node_rule: string;
  node_branch: string;
  lower_bound: number | string | null;
  upper_bound: number | string | null;
  node_label: string | null;
  list_values: string | null;
  missing: boolean;
}

const TreeVisualization = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [zoom, setZoom] = useState(1);
  const treeRef = useRef<HTMLDivElement>(null);
  const [showColorSettings, setShowColorSettings] = useState(false);
  const [showTreeAttributes, setShowTreeAttributes] = useState(false);
  const [colorConfig, setColorConfig] = useState<ColorConfig>({
    mode: 'solid',
    color1: '#ffffff',
    color2: '#ffffff'
  });
  const [treeAttributes, setTreeAttributes] = useState<TreeAttributes>({
    maxDepth: "5",
    minNodeSplit: "500",
    minLeafSize: "100",
    maxBranches: "5",
    criteria: "entropy",
    uniqueVar: "0",
    monotonicSplits: "0"
  });
  const [nodeMaster, setNodeMaster] = useState<NodeMasterData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set([1])); // Root node expanded by default
  const [regressionFlag, setRegressionFlag] = useState<number>(0); // 0 = Binary Classification, 1 = Regression
  
  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportType, setExportType] = useState<"snapshot" | "python" | "sql" | "node_report" | "save_tree" | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Pinch zoom state
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  const [initialZoom, setInitialZoom] = useState<number>(1);

  // Generate Python code from node rules
  const generatePythonCode = (nodeMaster: NodeMasterData[]): string => {
    if (nodeMaster.length === 0) return '';

    // Sort nodes by level and node_number to ensure proper order
    const sortedNodes = [...nodeMaster].sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.node_number - b.node_number;
    });

    // Get all unique variables used in the tree
    const variables = [...new Set(sortedNodes
      .filter(node => node.variable !== 'Parent')
      .map(node => node.variable))];

    // Build the decision tree function
    let pythonCode = `import pandas as pd
import numpy as np

def assign_node_number(row):
    """
    Decision Tree Node Assignment
    Returns the node number for a given data row based on the decision tree rules.
    
    Parameters:
    row (pandas.Series): Pandas row containing feature values
    
    Returns:
    int: Node number where the data point ends up
    """
    
    # Extract variables from row
${variables.map(variable => `    ${variable.toLowerCase()} = row['${variable}']`).join('\n')}
    
`;

    // Generate the tree structure recursively
    const generateNodeLogic = (parentNodeNumber: number, indentLevel: number = 0): string => {
      const children = sortedNodes.filter(node => node.parent_node === parentNodeNumber);
      
      if (children.length === 0) return '';
      
      let logic = '';
      const indent = '    '.repeat(indentLevel);
      
      for (const child of children) {
        if (child.node_rule === 'Parent') continue;
        
        // Convert node_rule to Python condition
        let condition = convertRuleToPython(child.node_rule, child.variable);
        
        if (child.leaf_flag) {
          // This is a leaf node, return the node number
          logic += `${indent}if ${condition}:\n`;
          logic += `${indent}    return ${child.node_number}\n`;
        } else {
          // This is an internal node, continue with nested logic
          logic += `${indent}if ${condition}:\n`;
          logic += generateNodeLogic(child.node_number, indentLevel + 1);
        }
      }
      
      return logic;
    };

    // Start from root node (node 1)
    pythonCode += generateNodeLogic(1, 0);
    
    pythonCode += `    
    # Default value if no condition matches
    return None

# Example usage:
if __name__ == "__main__":
    import pandas as pd
    
    # Example data
    data = pd.DataFrame({
        'Glucose': [140, 180, 120],
        'BMI': ['02. [20, 25)', '04. [30, 35)', '01. [0, 20)']
    })
    
    # Apply the function to each row
    data['node_number'] = data.apply(assign_node_number, axis=1)
    print(data)
`;

    return pythonCode;
  };

  // Helper function to convert node rules to Python conditions
  const convertRuleToPython = (rule: string, variable: string): string => {
    if (!rule || rule === 'Parent') return 'True';
    
    let pythonRule = rule;
    
    // Handle missing value conditions
    if (rule.includes('== np.nan') || rule.includes('== np.null')) {
      pythonRule = rule.replace(/== np\.nan|== np\.null/g, 'pd.isnull(' + variable.toLowerCase() + ')');
    }
    
    // Handle 'in' conditions for categorical variables
    if (rule.includes(' in [')) {
      // Extract the list from the rule
      const listMatch = rule.match(/ in \[(.*?)\]/);
      if (listMatch) {
        const listContent = listMatch[1];
        pythonRule = rule.replace(/ in \[.*?\]/, ' in [' + listContent + ']');
      }
    }
    
    // Handle complex conditions with missing values
    if (rule.includes('|') && rule.includes('np.nan')) {
      // Split by | and handle each part
      const parts = rule.split('|');
      const processedParts = parts.map(part => {
        let processedPart = part.trim();
        if (processedPart.includes('np.nan')) {
          processedPart = processedPart.replace(/== np\.nan/g, 'pd.isnull(' + variable.toLowerCase() + ')');
        }
        return processedPart;
      });
      pythonRule = processedParts.join(' or ');
    }
    
    // Replace variable names with lowercase versions
    pythonRule = pythonRule.replace(new RegExp('\\b' + variable + '\\b', 'g'), variable.toLowerCase());
    
    return pythonRule;
  };

  // Export Python code
  const handleExportPython = () => {
    setExportType("python");
    setExportDialogOpen(true);
  };

  const executeExportPython = async (method: ExportMethod, s3Path?: string) => {
    const pythonCode = generatePythonCode(nodeMaster);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `decision_tree_predictor_${timestamp}.py`;
    
    if (method === "s3" && s3Path) {
      setIsExporting(true);
      try {
        await apiService.uploadFileToS3(pythonCode, filename, 'text/python', s3Path);
        toast({
          title: "Export Successful",
          description: `Python code uploaded to S3: ${s3Path}`,
        });
      } catch (error) {
        toast({
          title: "Export Failed",
          description: "Failed to upload Python code to S3. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsExporting(false);
      }
    } else {
      // Use data URL instead of blob to avoid HTTPS warnings
      const dataUrl = `data:text/python;charset=utf-8,${encodeURIComponent(pythonCode)}`;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);
      toast({
        title: "Export Successful",
        description: "Python code has been exported successfully!",
      });
    }
  };

  // Generate SQL code from node rules
  const generateSQLCode = (nodeMaster: NodeMasterData[]): string => {
    if (nodeMaster.length === 0) return '';

    // Sort nodes by level and node_number to ensure proper order
    const sortedNodes = [...nodeMaster].sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.node_number - b.node_number;
    });

    // Get all unique variables used in the tree
    const variables = [...new Set(sortedNodes
      .filter(node => node.variable !== 'Parent')
      .map(node => node.variable))];

    // Build the SQL CASE WHEN statement
    let sqlCode = `-- Decision Tree SQL Predictor
-- Returns the node number for a given data row based on the decision tree rules.
-- 
-- Usage:
-- SELECT 
--   *,
--   CASE 
--     [CASE_LOGIC_HERE]
--   END AS node_number
-- FROM your_table;

SELECT 
  *,
  CASE 
`;

    // Generate the tree structure recursively for SQL
    const generateSQLNodeLogic = (parentNodeNumber: number, indentLevel: number = 1): string => {
      const children = sortedNodes.filter(node => node.parent_node === parentNodeNumber);
      
      if (children.length === 0) return '';
      
      let logic = '';
      const indent = '    '.repeat(indentLevel);
      
      for (const child of children) {
        if (child.node_rule === 'Parent') continue;
        
        // Convert node_rule to SQL condition
        let condition = convertRuleToSQL(child.node_rule, child.variable);
        
        if (child.leaf_flag) {
          // This is a leaf node, return the node number
          logic += `${indent}WHEN ${condition} THEN ${child.node_number}\n`;
        } else {
          // This is an internal node, continue with nested logic
          logic += `${indent}WHEN ${condition} THEN (\n`;
          logic += generateSQLNodeLogic(child.node_number, indentLevel + 1);
          logic += `${indent})\n`;
        }
      }
      
      return logic;
    };

    // Start from root node (node 1)
    sqlCode += generateSQLNodeLogic(1, 1);
    
    sqlCode += `    ELSE NULL
  END AS node_number
FROM your_table;

-- Example with specific columns:
-- SELECT 
--   ${variables.join(', ')},
--   CASE 
`;

    // Add example with specific columns
    sqlCode += generateSQLNodeLogic(1, 1);
    
    sqlCode += `    ELSE NULL
  END AS node_number
FROM your_table;
`;

    return sqlCode;
  };

  // Helper function to convert node rules to SQL conditions
  const convertRuleToSQL = (rule: string, variable: string): string => {
    if (!rule || rule === 'Parent') return '1=1';
    
    let sqlRule = rule;
    
    // Handle missing value conditions
    if (rule.includes('== np.nan') || rule.includes('== np.null')) {
      sqlRule = rule.replace(/== np\.nan|== np\.null/g, 'IS NULL');
    }
    
    // Handle 'in' conditions for categorical variables
    if (rule.includes(' in [')) {
      // Extract the list from the rule and convert to SQL IN clause
      const listMatch = rule.match(/ in \[(.*?)\]/);
      if (listMatch) {
        const listContent = listMatch[1];
        sqlRule = rule.replace(/ in \[.*?\]/, ' IN (' + listContent + ')');
      }
    }
    
    // Handle complex conditions with missing values
    if (rule.includes('|') && rule.includes('np.nan')) {
      // Split by | and handle each part
      const parts = rule.split('|');
      const processedParts = parts.map(part => {
        let processedPart = part.trim();
        if (processedPart.includes('np.nan')) {
          processedPart = processedPart.replace(/== np\.nan/g, 'IS NULL');
        }
        return processedPart;
      });
      sqlRule = processedParts.join(' OR ');
    }
    
    // Replace variable names with column names (keep original case for SQL)
    sqlRule = sqlRule.replace(new RegExp('\\b' + variable + '\\b', 'g'), `"${variable}"`);
    
    // Handle string comparisons - add quotes around string values
    sqlRule = sqlRule.replace(/([^=<>!]+)\s*([=<>!]+)\s*([^0-9\s\-\.]+)/g, (match, left, operator, right) => {
      // If right side is not a number, treat it as a string
      if (!/^\d+\.?\d*$/.test(right.trim()) && !right.includes("'")) {
        return `${left} ${operator} '${right.trim()}'`;
      }
      return match;
    });
    
    return sqlRule;
  };

  // Export SQL code
  const handleExportSQL = () => {
    setExportType("sql");
    setExportDialogOpen(true);
  };

  const executeExportSQL = async (method: ExportMethod, s3Path?: string) => {
    const sqlCode = generateSQLCode(nodeMaster);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `decision_tree_predictor_${timestamp}.sql`;
    
    if (method === "s3" && s3Path) {
      setIsExporting(true);
      try {
        await apiService.uploadFileToS3(sqlCode, filename, 'text/sql', s3Path);
        toast({
          title: "Export Successful",
          description: `SQL code uploaded to S3: ${s3Path}`,
        });
      } catch (error) {
        toast({
          title: "Export Failed",
          description: "Failed to upload SQL code to S3. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsExporting(false);
      }
    } else {
      // Use data URL instead of blob to avoid HTTPS warnings
      const dataUrl = `data:text/sql;charset=utf-8,${encodeURIComponent(sqlCode)}`;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);
      toast({
        title: "Export Successful",
        description: "SQL code has been exported successfully!",
      });
    }
  };

  // Generate Node Report CSV
  const generateNodeReportCSV = (nodeMaster: NodeMasterData[]): string => {
    if (nodeMaster.length === 0) return '';

    // Find nodes that have no children (terminal nodes)
    const nodesWithChildren = new Set(nodeMaster.map(node => node.parent_node));
    const terminalNodes = nodeMaster.filter(node => 
      node.node_number !== 1 && // Exclude root node (parent_node = 0)
      !nodesWithChildren.has(node.node_number) // No other node has this as parent
    );

    // CSV headers - use 'average' for regression, 'event_rate' for classification
    const rateColumnName = regressionFlag === 1 ? 'average' : 'event_rate';
    const headers = [
      'node_number',
      'variable', 
      'lower_bound',
      'upper_bound',
      'list_values',
      'node_rule',
      'missing',
      '# of records',
      rateColumnName,
      'node_label'
    ];

    // Generate CSV content
    let csvContent = headers.join(',') + '\n';

    // Add data rows
    terminalNodes.forEach(node => {
      const row = [
        node.node_number,
        `"${node.variable || ''}"`,
        node.lower_bound !== null && node.lower_bound !== 'Parent' ? node.lower_bound : '',
        node.upper_bound !== null && node.upper_bound !== 'Parent' ? node.upper_bound : '',
        `"${Array.isArray(node.list_values) ? node.list_values.join(',') : (node.list_values || '')}"`,
        `"${node.node_rule || ''}"`,
        node.missing ? '1' : '0',
        node.count,
        node.event_rate,
        `"${node.node_label || ''}"`
      ];
      csvContent += row.join(',') + '\n';
    });

    return csvContent;
  };

  // Export Node report as CSV
  const handleExportNodeReport = () => {
    setExportType("node_report");
    setExportDialogOpen(true);
  };

  const executeExportNodeReport = async (method: ExportMethod, s3Path?: string) => {
    const csvContent = generateNodeReportCSV(nodeMaster);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `node_report_${timestamp}.csv`;
    
    if (method === "s3" && s3Path) {
      setIsExporting(true);
      try {
        await apiService.uploadFileToS3(csvContent, filename, 'text/csv', s3Path);
        toast({
          title: "Export Successful",
          description: `Node report uploaded to S3: ${s3Path}`,
        });
      } catch (error) {
        toast({
          title: "Export Failed",
          description: "Failed to upload node report to S3. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsExporting(false);
      }
    } else {
      // Use data URL instead of blob to avoid HTTPS warnings
      const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);
      toast({
        title: "Export Successful",
        description: "Node report has been exported successfully!",
      });
    }
  };


  // Fetch tree data from API
  const fetchTreeData = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getTreeData();
      setNodeMaster(response.node_master);
      console.log('Tree data loaded:', response.node_master);
      
      // Expand all nodes by default to show the complete tree
      const allNodeNumbers = response.node_master.map(node => node.node_number);
      setExpandedNodes(new Set(allNodeNumbers));
    } catch (error) {
      console.error('Error fetching tree data:', error);
      toast({
        title: "Error Loading Tree",
        description: "Failed to load decision tree data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch regression flag from import diagnostics
  const fetchRegressionFlag = async () => {
    try {
      const diagnostics = await apiService.getImportDiagnostics();
      setRegressionFlag(diagnostics.hyperparameters.regression_flag || 0);
      console.log('Regression flag loaded:', diagnostics.hyperparameters.regression_flag);
    } catch (error) {
      console.error('Error fetching regression flag:', error);
      // Default to classification if we can't fetch the flag
      setRegressionFlag(0);
    }
  };

  useEffect(() => {
    // Check if we have imported data from navigation state
    const importedData = location.state?.importedData;
    const isImported = location.state?.isImported;
    
    if (isImported && importedData) {
      // Use imported data directly
      setNodeMaster(importedData);
      setIsLoading(false);
      
      // Expand all nodes by default to show the complete tree
      const allNodeNumbers = importedData.map((node: NodeMasterData) => node.node_number);
      setExpandedNodes(new Set(allNodeNumbers));
      
      console.log('Imported tree data loaded:', importedData);
    } else {
      // Fetch tree data from API as usual
      fetchTreeData();
    }
    
    // Always fetch regression flag
    fetchRegressionFlag();
  }, [toast, location.state]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));
  const handleResetZoom = () => setZoom(1);

  // Calculate distance between two touch points
  const getTouchDistance = (touches: TouchList): number => {
    if (touches.length < 2) return 0;
    const touch1 = touches[0];
    const touch2 = touches[1];
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Handle touch start for pinch zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = getTouchDistance(e.touches);
      setLastTouchDistance(distance);
      setInitialZoom(zoom);
    }
  };

  // Handle touch move for pinch zoom
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance !== null) {
      e.preventDefault(); // Prevent scrolling while pinching
      const currentDistance = getTouchDistance(e.touches);
      const scale = currentDistance / lastTouchDistance;
      const newZoom = initialZoom * scale;
      
      // Constrain zoom between 0.5 and 2
      const constrainedZoom = Math.max(0.5, Math.min(2, newZoom));
      setZoom(constrainedZoom);
    }
  };

  // Handle touch end for pinch zoom
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      setLastTouchDistance(null);
      setInitialZoom(zoom);
    }
  };

  // Expand/Collapse all functionality
  const handleExpandAll = () => {
    const allNodeNumbers = nodeMaster.map(node => node.node_number);
    setExpandedNodes(new Set(allNodeNumbers));
  };

  const handleCollapseAll = () => {
    setExpandedNodes(new Set([1])); // Keep only root node expanded
  };

  // Snapshot functionality
  const handleSnapshot = () => {
    setExportType("snapshot");
    setExportDialogOpen(true);
  };

  const executeSnapshot = async (method: ExportMethod, s3Path?: string) => {
    if (!treeRef.current) {
      toast({
        title: "Error",
        description: "Tree container not found. Please try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsExporting(true);
      
      // Show loading toast
      if (method === "s3") {
        toast({
          title: "Creating Snapshot",
          description: "Capturing decision tree and uploading to S3...",
        });
      } else {
        toast({
          title: "Creating Snapshot",
          description: "Capturing decision tree as image...",
        });
      }

      // Find the SVG element within the tree container
      const svgElement = treeRef.current.querySelector('svg');
      if (!svgElement) {
        toast({
          title: "Error",
          description: "Tree visualization not found. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Create a temporary container for the SVG with proper styling
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '-9999px';
      tempContainer.style.backgroundColor = 'white';
      tempContainer.style.padding = '20px';
      
      // Clone the SVG and add it to the temporary container
      const clonedSvg = svgElement.cloneNode(true) as SVGElement;
      tempContainer.appendChild(clonedSvg);
      document.body.appendChild(tempContainer);

      // Use html2canvas to capture the SVG
      const canvas = await html2canvas(tempContainer, {
        backgroundColor: 'white',
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: true,
        width: tempContainer.offsetWidth,
        height: tempContainer.offsetHeight,
      });

      // Clean up the temporary container
      document.body.removeChild(tempContainer);

      // Convert canvas to blob
      canvas.toBlob(async (blob) => {
        if (blob) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const filename = `decision-tree-${timestamp}.jpg`;
          
          if (method === "s3" && s3Path) {
            try {
              // Convert blob to base64 for S3 upload
              const reader = new FileReader();
              reader.onloadend = async () => {
                try {
                  const base64data = reader.result as string;
                  const base64Content = base64data.split(',')[1]; // Remove data:image/jpeg;base64, prefix
                  await apiService.uploadFileToS3(base64Content, filename, 'image/jpeg', s3Path);
                  toast({
                    title: "Snapshot Saved",
                    description: `Decision tree snapshot uploaded to S3: ${s3Path}`,
                  });
                } catch (error) {
                  toast({
                    title: "Error",
                    description: "Failed to upload snapshot to S3. Please try again.",
                    variant: "destructive",
                  });
                } finally {
                  setIsExporting(false);
                }
              };
              reader.onerror = () => {
                toast({
                  title: "Error",
                  description: "Failed to convert image. Please try again.",
                  variant: "destructive",
                });
                setIsExporting(false);
              };
              reader.readAsDataURL(blob);
              return;
            } catch (error) {
              toast({
                title: "Error",
                description: "Failed to upload snapshot to S3. Please try again.",
                variant: "destructive",
              });
              setIsExporting(false);
              return;
            }
          }
          
          // Download locally - use data URL to avoid HTTPS warnings
          const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
          const link = document.createElement('a');
          link.href = imageDataUrl;
          link.download = filename;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
          }, 100);
          toast({
            title: "Snapshot Saved",
            description: `Decision tree saved as ${filename}`,
          });
          setIsExporting(false);
        } else {
          toast({
            title: "Error",
            description: "Failed to create image. Please try again.",
            variant: "destructive",
          });
          setIsExporting(false);
        }
      }, 'image/jpeg', 0.9);

    } catch (error) {
      console.error('Error creating snapshot:', error);
      toast({
        title: "Error",
        description: "Failed to create snapshot. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSaveTree = () => {
    console.log("Opening export dialog for save tree");
    setExportType("save_tree");
    setExportDialogOpen(true);
  };

  const executeSaveTree = async (method: ExportMethod, s3Path?: string) => {
    try {
      setIsExporting(true);
      
      if (method === "s3" && s3Path) {
        // Use API to download and upload to S3
        const result = await apiService.downloadTree(s3Path);
        if ('message' in result) {
          toast({
            title: "Success",
            description: result.message,
          });
        }
        setIsExporting(false);
        return;
      }
      
      // Call the API to get the tree data
      const treeData = await apiService.downloadTree();
      
      // Convert to JSON string with proper formatting
      const treeJson = JSON.stringify(treeData, null, 2);
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `decision_tree_${timestamp}.json`;
      
      // Try to use the modern File System Access API
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [
              {
                description: 'JSON files',
                accept: {
                  'application/json': ['.json'],
                },
              },
            ],
          });
          
          const writable = await fileHandle.createWritable();
          await writable.write(treeJson);
          await writable.close();
          
          toast({
            title: "Success",
            description: "Tree saved successfully!",
          });
          return;
        } catch (err) {
          // User cancelled or error occurred, fall back to download
          console.log('Save cancelled or failed:', err);
        }
      }
      
      // Fallback for unsupported browsers - traditional download
      // Use data URL instead of blob URL to avoid HTTPS warnings on HTTP pages
      const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(treeJson)}`;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);
      
      toast({
        title: "Success",
        description: "Tree saved successfully!",
      });
      
    } catch (error) {
      console.error('Error saving tree:', error);
      toast({
        title: "Error",
        description: "Failed to save tree. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Unified export handler
  const handleExport = (method: ExportMethod, s3Path?: string) => {
    const currentType = exportType; // Store before closing dialog
    
    // Close dialog first
    setExportDialogOpen(false);
    
    // Execute export based on type
    switch (currentType) {
      case "snapshot":
        executeSnapshot(method, s3Path);
        break;
      case "python":
        executeExportPython(method, s3Path);
        break;
      case "sql":
        executeExportSQL(method, s3Path);
        break;
      case "node_report":
        executeExportNodeReport(method, s3Path);
        break;
      case "save_tree":
        executeSaveTree(method, s3Path);
        break;
      default:
        console.warn("Unknown export type:", currentType);
    }
    
    // Reset export type after a short delay to ensure dialog closes
    setTimeout(() => {
      setExportType(null);
    }, 100);
  };

  // Get export dialog props based on type
  const getExportDialogProps = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    switch (exportType) {
      case "snapshot":
        return { defaultFilename: `decision-tree-${timestamp}`, fileExtension: "jpg" };
      case "python":
        return { defaultFilename: `decision_tree_predictor_${timestamp}`, fileExtension: "py" };
      case "sql":
        return { defaultFilename: `decision_tree_predictor_${timestamp}`, fileExtension: "sql" };
      case "node_report":
        return { defaultFilename: `node_report_${timestamp}`, fileExtension: "csv" };
      case "save_tree":
        return { defaultFilename: `decision_tree_${timestamp}`, fileExtension: "json" };
      default:
        return { defaultFilename: "export", fileExtension: "txt" };
    }
  };

  return (
    <div className="min-h-[calc(100vh-var(--app-header-height))] bg-gradient-subtle flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-50 to-red-100/80 backdrop-blur-sm border-b border-red-200 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold text-foreground">Decision Tree Visualization</h1>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleExpandAll}>
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={handleCollapseAll}>
                Collapse All
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowColorSettings(true)}>
                <Palette className="h-4 w-4 mr-2" />
                Colours
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowTreeAttributes(true)}>
                <BarChart3 className="h-4 w-4 mr-2" />
                Tree Attributes
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Export Tree
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={handleSnapshot} className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    Snapshot
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPython} className="flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Python Code
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportSQL} className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    SQL Code
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportNodeReport} className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Node Report
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSaveTree} className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Save Tree
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 w-full h-full">

        {/* Tree Visualization */}
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Card className="shadow-card border-0">
              <CardContent className="p-8 text-center">
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  <span className="text-muted-foreground">Loading decision tree...</span>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div 
            ref={treeRef} 
            className="w-full h-full"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <DecisionTreeRenderer 
              nodeMaster={nodeMaster} 
              zoom={zoom}
              expandedNodes={expandedNodes}
              onToggleNodeExpansion={(nodeNumber: number) => {
                setExpandedNodes(prev => {
                  const newSet = new Set(prev);
                  if (newSet.has(nodeNumber)) {
                    newSet.delete(nodeNumber);
                  } else {
                    newSet.add(nodeNumber);
                  }
                  return newSet;
                });
              }}
              colorConfig={colorConfig}
              onTreeRefresh={fetchTreeData}
              regressionFlag={regressionFlag}
            />
          </div>
        )}

      </div>

      {/* Color Settings Dialog */}
      <NodeColorSettings
        isOpen={showColorSettings}
        onClose={() => setShowColorSettings(false)}
        onSave={setColorConfig}
        currentConfig={colorConfig}
      />

      {/* Tree Attributes Dialog */}
      <TreeAttributesDialog
        isOpen={showTreeAttributes}
        onClose={() => setShowTreeAttributes(false)}
        currentAttributes={treeAttributes}
        onAttributesUpdated={setTreeAttributes}
      />
      
      {/* Export Dialog */}
      {exportType && (
        <ExportDialog
          isOpen={exportDialogOpen}
          onClose={() => {
            setExportDialogOpen(false);
            setExportType(null);
          }}
          onExport={handleExport}
          defaultFilename={getExportDialogProps().defaultFilename}
          fileExtension={getExportDialogProps().fileExtension}
          isLoading={isExporting}
        />
      )}
    </div>
  );
};

export default TreeVisualization;
