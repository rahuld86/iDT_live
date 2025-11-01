// API service for decision tree application

// Use environment variable at build time, fallback to relative path
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface UploadResponse {
  rows: number;
  columns: number;
  sample: Record<string, any>[];
  columnsList: string[];
}

export interface ApiError {
  message: string;
  status?: number;
}

class ApiService {
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    console.log(`Making API request to: ${url}`);
    console.log('Request options:', options);
    
    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // If the body is FormData, don't set Content-Type header
    // Let the browser set it with the proper boundary
    if (options.body instanceof FormData) {
      delete defaultOptions.headers;
    }

    const config = { ...defaultOptions, ...options };

    try {
      const response = await fetch(url, config);
      
      console.log(`Response status: ${response.status}`);
      console.log(`Response headers:`, response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP error response:`, errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      let data;
      try {
        // Read response as text first to avoid "Response body is already used" error
        const responseText = await response.text();
        console.log('Raw response text:', responseText);
        
        // Parse the JSON
        data = JSON.parse(responseText);
        console.log('API response data:', data);
      } catch (jsonError) {
        console.error('JSON parsing error:', jsonError);
        throw new Error(`Invalid JSON response from server: ${jsonError.message}`);
      }
      return data;
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  async uploadFile(file: File | string): Promise<UploadResponse> {
    if (typeof file === 'string') {
      // Handle URL case - send the URL as file path
      return this.makeRequest<UploadResponse>('/upload', {
        method: 'POST',
        body: JSON.stringify({ file: file }),
      });
    } else {
      // Handle file upload case - use FormData for multipart upload
      const formData = new FormData();
      formData.append('file', file);
      
      const url = `${API_BASE_URL}/upload`;
      console.log(`Making file upload request to: ${url}`);
      console.log('Uploading file:', file.name, 'Size:', file.size, 'bytes');
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData, // Use FormData for file uploads (don't set Content-Type header)
      });
      
      console.log(`File upload response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`File upload error response:`, errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      
      let data;
      try {
        data = await response.json();
        console.log('File upload response data:', data);
      } catch (jsonError) {
        console.error('JSON parsing error in file upload:', jsonError);
        // Clone the response to read the text without consuming the original stream
        const responseClone = response.clone();
        const responseText = await responseClone.text();
        console.error('Raw response text:', responseText);
        throw new Error(`Invalid JSON response from server: ${jsonError.message}`);
      }
      return data;
    }
  }

  async setTarget(target: string, regressionFlag: number = 0): Promise<{ message: string }> {
    return this.makeRequest<{ message: string }>('/setTarget', {
      method: 'POST',
      body: JSON.stringify({ target, regression_flag: regressionFlag }),
    });
  }

  async getTypes(): Promise<Record<string, string>> {
    return this.makeRequest<Record<string, string>>('/getTypes', {
      method: 'GET',
    });
  }

  async keepVariables(variables: Record<string, string>): Promise<{ columnsList: string[] }> {
    return this.makeRequest<{ columnsList: string[] }>('/keepVar', {
      method: 'POST',
      body: JSON.stringify(variables),
    });
  }

  async defineHyperparameters(params: {
    max_depth: number;
    min_node_split: number;
    min_leaf_size: number;
    max_branches: number;
    criteria: string;
    unique_var: number;
    monotonous: number;
  }): Promise<typeof params> {
    return this.makeRequest<typeof params>('/defineHP', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async initTree(): Promise<{ node_master: any }> {
    return this.makeRequest<{ node_master: any }>('/initTree', {
      method: 'POST',
    });
  }

  async autoTree(): Promise<{ node_master: any }> {
    return this.makeRequest<{ node_master: any }>('/autoTree', {
      method: 'POST',
    });
  }

  async getTreeData(): Promise<{ node_master: any }> {
    return this.makeRequest<{ node_master: any }>('/getTreeData', {
      method: 'GET',
    });
  }

  async delSubTree(nodeNumber: number): Promise<{ message: string }> {
    return this.makeRequest<{ message: string }>('/delSubTree', {
      method: 'POST',
      body: JSON.stringify({ node_number: nodeNumber }),
    });
  }

  async autoTrainSubTree(nodeNumber: number): Promise<{ node_master: any }> {
    return this.makeRequest<{ node_master: any }>('/autoTrainSubTree', {
      method: 'POST',
      body: JSON.stringify({ node_number: nodeNumber }),
    });
  }

  async findSplit(nodeNumber: number): Promise<{ node_master: any }> {
    return this.makeRequest<{ node_master: any }>('/findSplit', {
      method: 'POST',
      body: JSON.stringify({ node_number: nodeNumber }),
    });
  }

  async copyNode(fromNode: number, toNode: number): Promise<{ node_master: any }> {
    return this.makeRequest<{ node_master: any }>('/copyNode', {
      method: 'POST',
      body: JSON.stringify({ from_node: fromNode, to_node: toNode }),
    });
  }

  async findVar(nodeNumber: number): Promise<{ top_vars: Array<{ variable: string; iv: number }> }> {
    return this.makeRequest<{ top_vars: Array<{ variable: string; iv: number }> }>('/findVar', {
      method: 'POST',
      body: JSON.stringify({ node_number: nodeNumber }),
    });
  }

  async bestSplit(nodeNumber: number, variable: string): Promise<{ best_split: Array<{ 
    all_records: number; 
    event_rate: number; 
    events: number; 
    list_values: string[]; 
    lower_bound: number; 
    missing: boolean; 
    upper_bound: number; 
    variable: string; 
  }> }> {
    return this.makeRequest<{ best_split: Array<{ 
      all_records: number; 
      event_rate: number; 
      events: number; 
      list_values: string[]; 
      lower_bound: number; 
      missing: boolean; 
      upper_bound: number; 
      variable: string; 
    }> }>('/bestSplit', {
      method: 'POST',
      body: JSON.stringify({ node_number: nodeNumber, variable_name: variable }),
    });
  }

  async evalSplit(nodeNumber: number, variable: string, splits: Array<{ lower_bound: number; upper_bound: number; list_values?: string | string[]; missing?: number }>): Promise<{ eval_split: Array<{ 
    all_records: number; 
    event_rate: number; 
    events: number; 
    list_values: string[]; 
    lower_bound: number; 
    missing: boolean; 
    upper_bound: number; 
    variable: string; 
  }> }> {
    return this.makeRequest<{ eval_split: Array<{ 
      all_records: number; 
      event_rate: number; 
      events: number; 
      list_values: string[]; 
      lower_bound: number; 
      missing: boolean; 
      upper_bound: number; 
      variable: string; 
    }> }>('/evalSplit', {
      method: 'POST',
      body: JSON.stringify({ 
        node_number: nodeNumber, 
        variable_name: variable,
        splits: splits
      }),
    });
  }

  async addNode(nodeNumber: number, variable: string, splits: Array<{ lower_bound: number; upper_bound: number; list_values?: string | string[]; missing?: number }>): Promise<{ success: boolean; message: string }> {
    return this.makeRequest<{ success: boolean; message: string }>('/addNode', {
      method: 'POST',
      body: JSON.stringify({ 
        node_number: nodeNumber, 
        variable_name: variable,
        splits: splits
      }),
    });
  }

  async downloadTree(s3Path?: string): Promise<{ 
    file_name: string;
    badflag: string;
    max_depth: string;
    min_node_split: string;
    min_leaf_size: string;
    max_branches: string;
    criteria: string;
    unique_var: string;
    monotonous: string;
    mapper: any;
    node_master: any;
  } | { message: string; s3_path: string }> {
    if (s3Path) {
      return this.makeRequest<{ message: string; s3_path: string }>('/downloadTree', {
        method: 'POST',
        body: JSON.stringify({ s3_path: s3Path }),
      });
    }
    return this.makeRequest<{ 
      file_name: string;
      badflag: string;
      max_depth: string;
      min_node_split: string;
      min_leaf_size: string;
      max_branches: string;
      criteria: string;
      unique_var: string;
      monotonous: string;
      mapper: any;
      node_master: any;
    }>('/downloadTree', {
      method: 'GET',
    });
  }

  async exportTree(s3Path?: string): Promise<any> {
    if (s3Path) {
      return this.makeRequest<{ message: string; s3_path: string }>('/exportTree', {
        method: 'POST',
        body: JSON.stringify({ s3_path: s3Path }),
      });
    }
    return this.makeRequest('/exportTree', {
      method: 'GET',
    });
  }

  async uploadFileToS3(content: string, filename: string, contentType: string, s3Path: string): Promise<{ message: string; s3_path: string }> {
    return this.makeRequest<{ message: string; s3_path: string }>('/uploadFileToS3', {
      method: 'POST',
      body: JSON.stringify({
        content,
        filename,
        content_type: contentType,
        s3_path: s3Path,
      }),
    });
  }

  async getImportDiagnostics(): Promise<{
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
      monotonous: number;
    };
    feature_columns: string[];
    df_for_tree_shape: [number, number] | null;
  }> {
    return this.makeRequest<{
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
        monotonous: number;
      };
      feature_columns: string[];
      df_for_tree_shape: [number, number] | null;
    }>('/getImportDiagnostics', {
      method: 'GET',
    });
  }

  async importTree(file: File | string): Promise<{ node_master: any }> {
    if (typeof file === 'string') {
      // Handle URL case - send the URL as file name
      return this.makeRequest<{ node_master: any }>('/importTree', {
        method: 'POST',
        body: JSON.stringify({ file_name: file }),
      });
    } else {
      // Handle file upload case - use FormData for multipart upload
      const formData = new FormData();
      formData.append('file', file);
      
      return this.makeRequest<{ node_master: any }>('/importTree', {
        method: 'POST',
        body: formData,
        headers: {
          // Don't set Content-Type header - let the browser set it with boundary for FormData
        },
      });
    }
  }

  async labelNode(nodeNumber: number, label: string): Promise<{ node_master: any }> {
    return this.makeRequest<{ node_master: any }>('/labelNode', {
      method: 'POST',
      body: JSON.stringify({ node_number: nodeNumber, label: label }),
    });
  }

  async getRegressionFlag(): Promise<{ regression_flag: number }> {
    return this.makeRequest<{ regression_flag: number }>('/getRegressionFlag', {
      method: 'GET',
    });
  }
}

export const apiService = new ApiService();
