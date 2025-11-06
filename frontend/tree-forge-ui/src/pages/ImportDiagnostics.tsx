import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { useToast } from '../hooks/use-toast';
import { apiService } from '../services/api';
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

interface ImportDiagnosticsData {
  dataset_info: {
    rows: number;
    columns: number;
    sample_records: Record<string, any>[];
  };
  target_variable: string;
  columns_info: Array<{
    column_name: string;
    datatype: string;
    unique_values: number;
    sample_values: any[];
  }>;
  mapper_info: Array<{
    column_name: string;
    datatype: string;
  }>;
  hyperparameters: {
    max_depth: number;
    min_node_split: number;
    min_leaf_size: number;
    max_branches: number;
    criteria: string;
    unique_var: number;
    monotonic: number;
  };
  feature_columns: string[];
  df_for_tree_shape: [number, number] | null;
}

const ImportDiagnostics: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<ImportDiagnosticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  const fetchDiagnostics = async () => {
    try {
      setIsLoading(true);
      const data = await apiService.getImportDiagnostics();
      setDiagnostics(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching import diagnostics:', err);
      setError('Failed to load import diagnostics');
      toast({
        title: "Error",
        description: "Failed to load import diagnostics. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = () => {
    // Navigate to tree visualization with imported data
    navigate('/tree-visualization', {
      state: {
        importedData: location.state?.importedData,
        isImported: true
      }
    });
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading import diagnostics...</p>
        </div>
      </div>
    );
  }

  if (error || !diagnostics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Diagnostics</h2>
          <p className="text-gray-600 mb-4">{error || 'No diagnostics data available'}</p>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Import Diagnostics</h1>
              <p className="text-gray-600 mt-2">Review the imported tree data and configuration</p>
            </div>
            <Button onClick={handleBack} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dataset Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                Dataset Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="font-medium">Rows:</span>
                  <Badge variant="secondary">{diagnostics.dataset_info.rows}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Columns:</span>
                  <Badge variant="secondary">{diagnostics.dataset_info.columns}</Badge>
                </div>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2">Sample Records (First 5):</h4>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <pre className="text-xs overflow-x-auto">
                      {JSON.stringify(diagnostics.dataset_info.sample_records, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Target Variable */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                Target Variable
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <Badge variant="default" className="text-lg px-4 py-2">
                  {diagnostics.target_variable}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Columns and Data Types */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                Columns and Data Types
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {diagnostics.columns_info.map((col, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div>
                      <span className="font-medium">{col.column_name}</span>
                      <div className="text-sm text-gray-600">
                        Unique values: {col.unique_values}
                      </div>
                    </div>
                    <Badge variant="outline">{col.datatype}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Mapper Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                Mapper Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {diagnostics.mapper_info.map((mapper, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="font-medium">{mapper.column_name}</span>
                    <Badge variant="outline">{mapper.datatype}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Hyperparameters */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                Hyperparameters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Max Depth</div>
                  <div className="text-lg font-semibold">{diagnostics.hyperparameters.max_depth}</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Min Node Split</div>
                  <div className="text-lg font-semibold">{diagnostics.hyperparameters.min_node_split}</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Min Leaf Size</div>
                  <div className="text-lg font-semibold">{diagnostics.hyperparameters.min_leaf_size}</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Max Branches</div>
                  <div className="text-lg font-semibold">{diagnostics.hyperparameters.max_branches}</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Criteria</div>
                  <div className="text-lg font-semibold">{diagnostics.hyperparameters.criteria}</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Unique Var</div>
                  <div className="text-lg font-semibold">{diagnostics.hyperparameters.unique_var}</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Monotonic</div>
                  <div className="text-lg font-semibold">{diagnostics.hyperparameters.monotonic}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Information */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                Additional Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Feature Columns:</h4>
                  <div className="flex flex-wrap gap-2">
                    {diagnostics.feature_columns.map((col, index) => (
                      <Badge key={index} variant="secondary">{col}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Tree Data Shape:</h4>
                  <Badge variant="outline">
                    {diagnostics.df_for_tree_shape ? 
                      `${diagnostics.df_for_tree_shape[0]} rows × ${diagnostics.df_for_tree_shape[1]} columns` : 
                      'Not available'
                    }
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Continue Button */}
        <div className="mt-8 text-center">
          <Button onClick={handleContinue} size="lg" className="px-8">
            Continue to Tree Visualization
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImportDiagnostics;
