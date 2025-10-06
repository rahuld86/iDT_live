# Decision Tree Backend API

This is the backend API for the Interactive Decision Tree web application. It provides RESTful endpoints for building, managing, and exporting decision trees.

## Features

- CSV file upload and processing
- Interactive decision tree building
- Tree visualization data export
- Node manipulation (split, copy, delete, label)
- Hyperparameter configuration
- Tree import/export functionality

## Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Run the Flask application:
```bash
python app.py
```

The API will be available at `http://localhost:5000`

## API Endpoints

### Data Management
- `POST /api/upload` - Upload CSV file
- `POST /api/setTarget` - Set target variable
- `GET /api/getTypes` - Get column data types
- `POST /api/keepVar` - Select variables to keep

### Tree Configuration
- `POST /api/defineHP` - Set hyperparameters
- `POST /api/initTree` - Initialize tree with root node

### Tree Building
- `POST /api/autoTree` - Build entire tree automatically
- `POST /api/findSplit` - Find best split for node
- `POST /api/findVar` - Find top variables for splitting
- `POST /api/bestSplit` - Find best split for specific variable
- `POST /api/evalSplit` - Evaluate custom splits
- `POST /api/addNode` - Add nodes based on splits

### Tree Management
- `POST /api/delSubTree` - Delete subtree
- `POST /api/autoTrainSubTree` - Auto-train subtree
- `POST /api/copyNode` - Copy subtree between nodes
- `POST /api/labelNode` - Add label to node

### Export/Import
- `GET /api/exportTree` - Export tree as JSON
- `GET /api/downloadTree` - Download tree as file
- `POST /api/importTree` - Import tree from file

### Health Check
- `GET /api/health` - API health status

## Error Handling

All endpoints include comprehensive error handling with standardized error responses:
```json
{
  "error": "Error message description"
}
```

## State Management

The application uses a centralized `TreeState` class to manage all tree-related data and configuration, replacing the previous global variable approach.

## Dependencies

- Flask 2.3.3
- Flask-CORS 4.0.0
- pandas 2.1.1
- numpy 1.24.3
- python-dotenv 1.0.0

## Development

The application runs in debug mode by default. For production deployment, set `debug=False` in the `app.run()` call.
