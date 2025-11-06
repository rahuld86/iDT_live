// Centralized type definitions for the Decision Tree Builder application

export interface TreeNodeData {
  id: string;
  condition?: string;
  records: number;
  eventRate: number;
  className: string;
  isLeaf: boolean;
  children?: TreeNodeData[];
  branchLabel?: string;
  customLabel?: string;
}

export interface ColorConfig {
  mode: 'solid' | 'split' | 'gradient';
  color1: string;
  color2: string;
}

export interface TreeAttributes {
  maxDepth: string;
  minNodeSplit: string;
  minLeafSize: string;
  maxBranches: string;
  criteria: string;
  uniqueVar: string;
  monotonicSplits: string;
}

export interface DataPreviewData {
  rows: number;
  columns: number;
  columnNames: string[];
  sampleData: Record<string, any>[];
}

export interface NumericalBin {
  bin: number;
  records: number;
  eventRate: number;
  lowerBound: string;
  upperBound: string;
}

export interface CategoricalValue {
  id: string;
  value: string;
  records: number;
  eventRate: number;
  binNumber?: number;
  isMerged?: boolean;
}

export interface Variable {
  name: string;
  informationValue?: number; // For classification problems
  rmse?: number; // For regression problems
  type: 'numerical' | 'categorical';
}

export type CreateTreeStep = "upload" | "preview" | "target" | "datatypes" | "attributes";

export type UploadMethod = "file" | "url";

export type DataType = "categorical" | "numerical" | "drop";

export type CriteriaType = "entropy" | "gini";

export type UniqueVarType = "0" | "1";

export type MonotonicSplitsType = "0" | "1";

export type RegressionFlagType = 0 | 1; // 0 = Binary Classification, 1 = Regression