import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DataPreviewProps {
  rows: number;
  columns: number;
  sampleData: Record<string, any>[];
  columnNames: string[];
}

const DataPreview = ({ rows, columns, sampleData, columnNames }: DataPreviewProps) => {
  return (
    <Card className="shadow-card border-0">
      <CardHeader>
        <CardTitle>Data Import Summary</CardTitle>
        <CardDescription>
          Successfully imported {rows} rows and {columns} columns
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-4 bg-accent/10 rounded-lg">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-muted-foreground">Rows:</span>
              <span className="ml-2 font-semibold">{rows.toLocaleString()}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Columns:</span>
              <span className="ml-2 font-semibold">{columns}</span>
            </div>
          </div>
        </div>
        
        <div>
          <h4 className="text-sm font-medium mb-3">Sample Data (Top 5 Rows)</h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  {columnNames.map((column, index) => (
                    <TableHead key={index} className="font-medium">
                      {column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleData.map((row, index) => (
                  <TableRow key={index}>
                    {columnNames.map((column, colIndex) => (
                      <TableCell key={colIndex} className="text-sm">
                        {row[column]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DataPreview;