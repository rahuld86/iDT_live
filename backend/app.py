from flask import Flask, request, jsonify, Response
from werkzeug.exceptions import HTTPException
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import pandas as pd
import numpy as np
import os
import json
import traceback
from datetime import datetime
from util import (
    init_setup, build_tree, del_subtree, build_tree_node, split_node, 
    find_var, best_split, eval_split, add_nodes, copy_node_wrapper, 
    add_label, classify_dtype, create_node_datasets, find_var_regression, best_split_regression
)
from session import (
    SessionState, SessionStore, LocalDiskDataFrameStore, DataFrameCache,
    SessionManager, SessionDataExpired, SessionCleanup, start_cleanup_scheduler,
    session_id_from_jwt
)

# Redis connection/timeout exceptions are used to map session-store
# unavailability to HTTP 503. ``redis`` is a runtime dependency; import its
# exception namespace defensively so the app still imports if it is somehow
# missing (in which case the Redis-unreachable branch simply never matches).
try:
    from redis import exceptions as redis_exceptions
    _REDIS_CONNECTION_ERRORS = (
        redis_exceptions.ConnectionError,
        redis_exceptions.TimeoutError,
    )
except Exception:  # pragma: no cover - redis is expected to be installed
    _REDIS_CONNECTION_ERRORS = ()

# S3 support
try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
    S3_AVAILABLE = True
except ImportError:
    S3_AVAILABLE = False
    print("Warning: boto3 not available. S3 functionality will be disabled.")

def get_s3_client():
    """Get S3 client with credentials from environment variables"""
    if not S3_AVAILABLE:
        return None
    
    try:
        return boto3.client(
            's3',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'us-east-1')
        )
    except Exception as e:
        print(f"Warning: Could not initialize S3 client: {e}")
        return None

def is_s3_path(path):
    """Check if path is an S3 path (s3://bucket/key)"""
    return path and (path.startswith('s3://') or path.startswith('s3a://') or path.startswith('s3n://'))

def parse_s3_path(s3_path):
    """Parse S3 path into bucket and key"""
    if not s3_path:
        return None, None
    
    # Remove protocol
    path = s3_path.replace('s3://', '').replace('s3a://', '').replace('s3n://', '')
    
    # Split into bucket and key
    parts = path.split('/', 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    elif len(parts) == 1:
        return parts[0], ''
    else:
        return None, None

def download_from_s3(s3_path, local_path):
    """Download file from S3 to local path"""
    if not S3_AVAILABLE:
        raise ValueError("S3 support not available. Please install boto3.")
    
    bucket, key = parse_s3_path(s3_path)
    if not bucket:
        raise ValueError(f"Invalid S3 path: {s3_path}. Missing bucket name. Format: s3://bucket/key")
    if not key:
        raise ValueError(f"Invalid S3 path: {s3_path}. Missing key/path. Format: s3://bucket/key")
    
    s3_client = get_s3_client()
    if not s3_client:
        raise ValueError("Could not initialize S3 client. Check AWS credentials.")
    
    try:
        # First check if the object exists
        s3_client.head_object(Bucket=bucket, Key=key)
        # If exists, download it
        s3_client.download_file(bucket, key, local_path)
        print(f"Successfully downloaded {s3_path} to {local_path}")
        return local_path
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', '')
        if error_code == '404' or error_code == 'NoSuchKey':
            raise ValueError(f"File not found in S3: {s3_path}. Please verify:\n"
                           f"1. The bucket name is correct: {bucket}\n"
                           f"2. The file path/key is correct: {key}\n"
                           f"3. The file exists in the S3 bucket\n"
                           f"4. You have read permissions for this S3 object")
        elif error_code == '403' or error_code == 'AccessDenied':
            raise ValueError(f"Access denied for S3 path: {s3_path}. Please check:\n"
                           f"1. AWS credentials have read permissions for bucket: {bucket}\n"
                           f"2. The file/key exists and you have access: {key}")
        else:
            raise ValueError(f"Failed to download from S3: {str(e)}\n"
                           f"Bucket: {bucket}, Key: {key}")

def upload_to_s3(local_path, s3_path):
    """Upload file from local path to S3"""
    if not S3_AVAILABLE:
        raise ValueError("S3 support not available. Please install boto3.")
    
    bucket, key = parse_s3_path(s3_path)
    if not bucket:
        raise ValueError(f"Invalid S3 path: {s3_path}. Missing bucket name.")
    if not key:
        raise ValueError(f"Invalid S3 path: {s3_path}. Missing key/path. Format: s3://bucket/key")
    
    s3_client = get_s3_client()
    if not s3_client:
        raise ValueError("Could not initialize S3 client. Check AWS credentials.")
    
    try:
        s3_client.upload_file(local_path, bucket, key)
        print(f"Successfully uploaded {local_path} to {s3_path}")
        return s3_path
    except ClientError as e:
        raise ValueError(f"Failed to upload to S3: {str(e)}")

def df_to_json_safe(df):
    """Convert DataFrame to JSON-safe format by replacing NaN with None"""
    if df is None or df.empty:
        return []
    
    # Replace NaN values with None for JSON serialization
    df_clean = df.copy()
    
    # Handle different data types
    for col in df_clean.columns:
        if df_clean[col].dtype in ['float64', 'float32']:
            # Replace NaN with None for float columns
            df_clean[col] = df_clean[col].where(pd.notnull(df_clean[col]), None)
        elif df_clean[col].dtype == 'object':
            # For object columns, replace NaN with None
            df_clean[col] = df_clean[col].where(pd.notnull(df_clean[col]), None)
    
    # Convert to dict and ensure all values are JSON serializable
    result = df_clean.to_dict(orient='records')
    
    # Additional cleanup for any remaining NaN values
    for record in result:
        for key, value in record.items():
            # Skip NA check for container types; lists (e.g., list_values) are valid JSON
            if isinstance(value, (list, tuple, dict)):
                continue
            try:
                is_na = pd.isna(value) if hasattr(pd, 'isna') else (value != value)
                # If is_na is array-like, treat as not-NA to avoid ambiguous truth
                if isinstance(is_na, (np.ndarray, pd.Series)):
                    is_na = False
                if is_na:
                    record[key] = None
            except Exception:
                # On any check failure, leave the value as-is
                pass
    
    return result

app = Flask(__name__)

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Configure CORS for production
CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',')
CORS(app, origins=CORS_ORIGINS, supports_credentials=True)

# Configure JWT
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'change-this-secret-key')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = int(os.getenv('JWT_ACCESS_TOKEN_EXPIRES', 86400))  # 24 hours default
jwt = JWTManager(app)

# Raise the maximum request body size to ~600MB (MAX_UPLOAD_SIZE). Bodies above
# this cap make Flask raise RequestEntityTooLarge, handled as HTTP 413 by the
# @app.errorhandler(413) below (Requirements 8.1, 8.2).
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_UPLOAD_SIZE', 629145600))

# Import auth utilities
from auth import verify_user


def _build_session_manager():
    """Build the session infrastructure from environment configuration.

    Returns a tuple ``(session_manager, session_store, df_store)`` so callers can
    also construct a :class:`SessionCleanup` over the same store instances.

    The DataFrame backend is selected by ``DF_STORE_BACKEND`` (default ``disk``):
      - ``disk`` -> :class:`LocalDiskDataFrameStore` (``DF_STORE_DIR`` env driven)
      - ``s3``   -> not yet implemented; the S3 backend is a Phase-2 feature.

    Note: building ``SessionStore()`` only creates a lazy Redis client; it does
    not open a connection here, so this is safe to call at module import even
    when Redis is not running.
    """
    session_store = SessionStore()

    backend = os.getenv('DF_STORE_BACKEND', 'disk').strip().lower()
    if backend == 's3':
        raise NotImplementedError(
            "DF_STORE_BACKEND='s3' is a Phase-2 feature and is not implemented yet. "
            "Use DF_STORE_BACKEND='disk' (the default)."
        )
    # Default / 'disk' backend.
    df_store = LocalDiskDataFrameStore()

    cache = DataFrameCache()
    manager = SessionManager(session_store, df_store, cache)
    return manager, session_store, df_store


# Instantiate the session infrastructure at module import. Redis connects lazily,
# so this does not force a connection even when Redis is unavailable.
session_manager, session_store, df_store = _build_session_manager()
session_cleanup = SessionCleanup(session_store, df_store)

# Start the background cleanup scheduler once per process. Guard against multiple
# starts under the Flask reloader / repeated imports. Registering the job does not
# force a Redis connection (the sweep runs later on its interval).
cleanup_scheduler = None
if not globals().get('_cleanup_scheduler_started'):
    try:
        cleanup_scheduler = start_cleanup_scheduler(session_cleanup)
        _cleanup_scheduler_started = True
    except Exception as _sched_err:  # noqa: BLE001 - never block import on scheduler
        print(f"Warning: could not start session cleanup scheduler: {_sched_err}")


def validate_required_fields(data, required_fields):
    """Validate that required fields are present in request data"""
    missing_fields = [field for field in required_fields if field not in data]
    if missing_fields:
        return False, f"Missing required fields: {', '.join(missing_fields)}"
    return True, None

def validate_file_exists(file_path):
    """Validate that file exists and is accessible"""
    if not file_path:
        return False, "File path is required"
    if not os.path.exists(file_path):
        return False, f"File '{file_path}' not found"
    return True, None

def handle_error(error_msg, status_code=500):
    """Standardized error handling"""
    print(f"Error: {error_msg}")
    print(traceback.format_exc())
    return jsonify({"error": error_msg}), status_code


def handle_storage_error(e):
    """Classify a session/storage exception into the right HTTP response.

    Centralizes the error-handling contract for the ``resolve -> use state ->
    persist`` lifecycle so every migrated endpoint can funnel its generic
    ``except Exception`` through a single place (Requirement 11):

    * Redis unreachable (``redis.exceptions.ConnectionError`` /
      ``TimeoutError``) -> HTTP 503 "Session store unavailable".
    * A session referencing a DataFrame key whose file no longer exists
      (surfaced as :class:`SessionDataExpired`, or a bare ``KeyError`` from the
      store) -> HTTP 400 "Session data expired, please re-upload". When a
      :class:`SessionDataExpired` carries the (already key-cleared) session, the
      stale pointer has been dropped on the in-memory state by the manager.
    * A parquet read/write / other storage IO failure (``OSError`` and
      friends) -> HTTP 500 including the underlying storage error context.
    * Anything else -> HTTP 500 with the error message (unchanged default).

    A Werkzeug ``HTTPException`` (e.g. ``RequestEntityTooLarge`` -> 413, raised
    when ``MAX_CONTENT_LENGTH`` is exceeded while an endpoint touches
    ``request.files``/``request.form``) is re-raised so Flask's registered
    error handlers produce the correct response (the broad ``except Exception``
    in endpoints must not swallow it into a generic 500).
    """
    # Let Flask's own error handlers deal with HTTP exceptions (e.g. 413).
    if isinstance(e, HTTPException):
        raise e

    # Redis unreachable -> 503.
    if _REDIS_CONNECTION_ERRORS and isinstance(e, _REDIS_CONNECTION_ERRORS):
        return handle_error("Session store unavailable", 503)

    # Missing DataFrame key -> 400 (expired session data).
    if isinstance(e, (SessionDataExpired, KeyError)):
        return handle_error("Session data expired, please re-upload", 400)

    # Parquet / filesystem IO failure -> 500 with storage context.
    if isinstance(e, (OSError, IOError)):
        return handle_error(f"Storage error: {e}", 500)

    # Fall back to the prior generic 500 behavior.
    return handle_error(str(e), 500)


@app.errorhandler(413)
def handle_payload_too_large(error):
    """Return a JSON body for oversized uploads (HTTP 413).

    Flask raises ``werkzeug.exceptions.RequestEntityTooLarge`` (413)
    automatically once ``MAX_CONTENT_LENGTH`` is exceeded (configured in task
    17.2). This handler formats that as a JSON error so the response contract is
    defined now (Requirement 8.2)."""
    return jsonify({"error": "Payload Too Large"}), 413

@app.route('/api/test', methods=['GET'])
def test():
    """Test endpoint to verify backend is working"""
    return jsonify({"message": "Backend is working", "timestamp": str(datetime.now())})

@app.route('/api/login', methods=['POST'])
def login():
    """Login endpoint - authenticates user and returns JWT token"""
    try:
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return handle_error("Username and password are required", 400)
        
        # Verify credentials
        if verify_user(username, password):
            # Create JWT token
            access_token = create_access_token(identity=username)
            return jsonify({
                'access_token': access_token,
                'username': username,
                'message': 'Login successful'
            })
        else:
            return handle_error("Invalid username or password", 401)
    
    except Exception as e:
        return handle_error(f"Login error: {str(e)}", 500)

@app.route('/api/logout', methods=['POST'])
@jwt_required()
def logout():
    """Logout endpoint - purges the user's session + heavy DataFrame files, then
    returns the existing success message. The JWT itself remains stateless."""
    sid = session_id_from_jwt()
    session_manager.purge(sid)
    return jsonify({"message": "Logout successful"})

@app.route('/api/user', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current authenticated user info"""
    username = get_jwt_identity()
    return jsonify({"username": username})

@app.route('/api/verify', methods=['GET'])
@jwt_required()
def verify_token():
    """Verify JWT token validity"""
    username = get_jwt_identity()
    return jsonify({"valid": True, "username": username})

@app.route('/api/importTree', methods=['POST'])
@jwt_required()
def importTree():
    """Import an existing decision tree from JSON file"""
    try:
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)
        print("=== IMPORT TREE ENDPOINT CALLED ===")
        print(f"Request content type: {request.content_type}")
        print(f"Request files: {list(request.files.keys())}")
        print(f"Request form: {list(request.form.keys())}")
        print("Starting import process...")
        
        # Check if this is a file upload (multipart/form-data)
        if 'file' in request.files:
            print("Processing file upload...")
            file = request.files['file']
            if file.filename == '':
                return handle_error("No file selected", 400)
            
            print(f"Uploaded file: {file.filename}")
            
            # Check if it's a CSV file
            if file.filename.lower().endswith('.csv'):
                print("CSV file detected - routing to upload endpoint")
                # For CSV files, we need to process them like the upload endpoint
                # Save uploaded file to temporary directory
                import tempfile
                
                # Create uploads directory if it doesn't exist
                upload_dir = os.path.join(os.getcwd(), 'uploads')
                os.makedirs(upload_dir, exist_ok=True)
                
                # Generate unique filename
                import uuid
                unique_filename = f"{uuid.uuid4()}_{file.filename}"
                file_path = os.path.join(upload_dir, unique_filename)
                
                # Save the file
                file.save(file_path)
                
                # Load CSV file, persist the heavy frame via the DataFrameStore.
                df = pd.read_csv(file_path)
                state.df_key = session_manager.set_dataframe(sid, state, "df", df)
                state.file_name = file_path
                state.original_data_source = file_path  # Store full path to saved file
                session_manager.persist(sid, state)
                
                # Return the same response as upload endpoint
                rows, columns = df.shape
                sample = df.head().replace({pd.NA: None, pd.NaT: None, np.nan: None}).to_dict(orient='records')
                column_names = df.columns.tolist()
                
                return jsonify({
                    "rows": rows,
                    "columns": columns,
                    "columnsList": column_names,
                    "sample": sample,
                    "is_csv_import": True  # Flag to indicate this is a CSV import
                })
            else:
                # Handle JSON file
                file_content = file.read().decode('utf-8')
                print(f"File content length: {len(file_content)}")
                data = json.loads(file_content)
                print("Successfully parsed JSON from uploaded file")
        else:
            print("Processing JSON data with file_name...")
            # Handle JSON data with file_name
            data = request.get_json()
            if not data:
                return handle_error("No JSON data provided", 400)
            
            # Validate required fields
            is_valid, error_msg = validate_required_fields(data, ["file_name"])
            if not is_valid:
                return handle_error(error_msg, 400)
            
            file_name = data.get("file_name")
            print(f"Looking for file: {file_name}")
            print(f"File name type: {type(file_name)}")
            print(f"File name repr: {repr(file_name)}")
            
            # Check if it's a CSV file
            if file_name.lower().endswith('.csv'):
                print("CSV file detected in URL case - routing to upload endpoint")
                # For CSV files, we need to process them like the upload endpoint
                # Check if it's an S3 path
                if is_s3_path(file_name):
                    # Handle S3 - download the file
                    try:
                        # Create uploads directory if it doesn't exist
                        upload_dir = os.path.join(os.getcwd(), 'uploads')
                        os.makedirs(upload_dir, exist_ok=True)
                        
                        # Generate unique filename
                        import uuid
                        unique_filename = f"{uuid.uuid4()}_s3_downloaded.csv"
                        file_path = os.path.join(upload_dir, unique_filename)
                        
                        # Download from S3
                        download_from_s3(file_name, file_path)
                        
                        # Load CSV file
                        df = pd.read_csv(file_path)
                        state.df_key = session_manager.set_dataframe(sid, state, "df", df)
                        state.file_name = file_path
                        state.original_data_source = file_name  # Store original S3 path
                        
                    except Exception as e:
                        return handle_error(f"Failed to download file from S3: {str(e)}", 400)
                # Check if it's a URL or local file path
                elif file_name.startswith(('http://', 'https://')):
                    # Handle URL - download the file
                    import requests
                    import tempfile
                    
                    try:
                        response = requests.get(file_name)
                        response.raise_for_status()
                        
                        # Create uploads directory if it doesn't exist
                        upload_dir = os.path.join(os.getcwd(), 'uploads')
                        os.makedirs(upload_dir, exist_ok=True)
                        
                        # Generate unique filename
                        import uuid
                        unique_filename = f"{uuid.uuid4()}_downloaded.csv"
                        file_path = os.path.join(upload_dir, unique_filename)
                        
                        # Save downloaded file
                        with open(file_path, 'wb') as f:
                            f.write(response.content)
                        
                        # Load CSV file
                        df = pd.read_csv(file_path)
                        state.df_key = session_manager.set_dataframe(sid, state, "df", df)
                        state.file_name = file_path
                        state.original_data_source = file_name  # Store original URL
                        
                    except requests.RequestException as e:
                        return handle_error(f"Failed to download file from URL: {str(e)}", 400)
                else:
                    # Handle local file path
                    print(f"Processing local file path: {file_name}")
                    print(f"Current working directory: {os.getcwd()}")
                    print(f"File exists check: {os.path.exists(file_name)}")
                    
                    # Try multiple path resolution strategies
                    file_paths_to_try = [
                        file_name,  # Try the original path first
                        os.path.basename(file_name),  # Try just the filename
                        os.path.join(os.getcwd(), file_name),  # Try with current working directory
                        os.path.join(os.getcwd(), os.path.basename(file_name))  # Try filename in current directory
                    ]
                    
                    df = None
                    file_loaded = False
                    for file_path in file_paths_to_try:
                        print(f"Trying file path: {file_path}")
                        if os.path.exists(file_path):
                            df = pd.read_csv(file_path)
                            state.df_key = session_manager.set_dataframe(sid, state, "df", df)
                            state.file_name = file_path
                            state.original_data_source = file_name  # Store original file path
                            print(f"Successfully loaded CSV with shape: {df.shape}")
                            file_loaded = True
                            break
                    
                    if not file_loaded:
                        print(f"Local file not found in any of the attempted paths: {file_paths_to_try}")
                        return handle_error(f"File not found in any attempted paths: {file_paths_to_try}", 404)
                
                # Return the same response as upload endpoint
                session_manager.persist(sid, state)
                rows, columns = df.shape
                sample = df.head().replace({pd.NA: None, pd.NaT: None, np.nan: None}).to_dict(orient='records')
                column_names = df.columns.tolist()
                
                return jsonify({
                    "rows": rows,
                    "columns": columns,
                    "columnsList": column_names,
                    "sample": sample,
                    "is_csv_import": True  # Flag to indicate this is a CSV import
                })
            else:
                # Handle JSON file
                # Check if it's an S3 path
                if is_s3_path(file_name):
                    # Handle S3 - download the file first
                    try:
                        # Create uploads directory if it doesn't exist
                        upload_dir = os.path.join(os.getcwd(), 'uploads')
                        os.makedirs(upload_dir, exist_ok=True)
                        
                        # Generate unique filename
                        import uuid
                        unique_filename = f"{uuid.uuid4()}_s3_imported.json"
                        file_path = os.path.join(upload_dir, unique_filename)
                        
                        # Download from S3
                        download_from_s3(file_name, file_path)
                        
                        # Load JSON from downloaded file
                        with open(file_path, "r") as f:
                            data = json.load(f)
                        print(f"Successfully loaded JSON tree from S3: {file_name}")
                        
                    except Exception as e:
                        return handle_error(f"Failed to download JSON file from S3: {str(e)}", 400)
                elif file_name.startswith(('http://', 'https://')):
                    # Handle URL - download the file first
                    import requests
                    
                    try:
                        response = requests.get(file_name)
                        response.raise_for_status()
                        
                        # Create uploads directory if it doesn't exist
                        upload_dir = os.path.join(os.getcwd(), 'uploads')
                        os.makedirs(upload_dir, exist_ok=True)
                        
                        # Generate unique filename
                        import uuid
                        unique_filename = f"{uuid.uuid4()}_downloaded.json"
                        file_path = os.path.join(upload_dir, unique_filename)
                        
                        # Save downloaded file
                        with open(file_path, 'wb') as f:
                            f.write(response.content)
                        
                        # Load JSON from downloaded file
                        with open(file_path, "r") as f:
                            data = json.load(f)
                        print(f"Successfully loaded JSON tree from URL: {file_name}")
                        
                    except requests.RequestException as e:
                        return handle_error(f"Failed to download JSON file from URL: {str(e)}", 400)
                else:
                    # Handle local file path
                    # Validate file exists
                    is_valid, error_msg = validate_file_exists(file_name)
                    if not is_valid:
                        return handle_error(error_msg, 404)
                    
                    with open(file_name, "r") as f:
                        data = json.load(f)
        
        # Load tree configuration
        state.file_name = data.get("file_name")
        state.badflag = data.get("badflag")
        state.max_depth = data.get("max_depth", 5)
        state.min_node_split = data.get("min_node_split", 500)
        state.min_leaf_size = data.get("min_leaf_size", 100)
        state.max_branches = data.get("max_branches", 5)
        state.criteria = data.get("criteria", "entropy")
        state.unique_var = data.get("unique_var", 0)
        state.monotonic = data.get("monotonic", 0)
        # Keep a local DataFrame for the mapper (``df_col_df``) for the logic
        # below that uses ``.isin(...)`` / ``.column_name``; persist as JSON.
        df_col_df = pd.DataFrame(data.get("mapper"))
        state.df_col = df_to_json_safe(df_col_df)
        node_master_read = pd.DataFrame(data.get("node_master"))
        
        # The loaded heavy data frame for this import; persisted via set_dataframe.
        df = None
        
        # Load and process data
        print(f"Loading data from file: {state.file_name}")
        
        # Try to load the original data source if it exists
        original_file_name = state.file_name
        print(f"Attempting to load original data from: {original_file_name}")
        
        # Check if the file_name in JSON points to a CSV file
        if original_file_name and original_file_name.lower().endswith('.csv'):
            print("JSON contains CSV file path - processing as CSV import")
            try:
                # Check if it's an S3 path
                if is_s3_path(original_file_name):
                    # Handle S3 - download the file
                    try:
                        # Create uploads directory if it doesn't exist
                        upload_dir = os.path.join(os.getcwd(), 'uploads')
                        os.makedirs(upload_dir, exist_ok=True)
                        
                        # Generate unique filename
                        import uuid
                        unique_filename = f"{uuid.uuid4()}_s3_imported.csv"
                        file_path = os.path.join(upload_dir, unique_filename)
                        
                        # Download from S3
                        download_from_s3(original_file_name, file_path)
                        
                        # Load CSV file
                        df = pd.read_csv(file_path)
                        print(f"Successfully loaded data from S3: {original_file_name}")
                        
                    except Exception as e:
                        print(f"Failed to download from S3: {e}. Creating mock dataset...")
                        raise e
                # Check if it's a URL or local file path
                elif original_file_name.startswith(('http://', 'https://')):
                    # Handle URL - download the file
                    import requests
                    import tempfile
                    
                    try:
                        response = requests.get(original_file_name)
                        response.raise_for_status()
                        
                        # Create uploads directory if it doesn't exist
                        upload_dir = os.path.join(os.getcwd(), 'uploads')
                        os.makedirs(upload_dir, exist_ok=True)
                        
                        # Generate unique filename
                        import uuid
                        unique_filename = f"{uuid.uuid4()}_imported.csv"
                        file_path = os.path.join(upload_dir, unique_filename)
                        
                        # Save downloaded file
                        with open(file_path, 'wb') as f:
                            f.write(response.content)
                        
                        # Load CSV file
                        df = pd.read_csv(file_path)
                        print(f"Successfully loaded data from URL: {original_file_name}")
                        
                    except requests.RequestException as e:
                        print(f"Failed to download from URL: {e}. Creating mock dataset...")
                        raise e
                else:
                    # Handle local file path
                    print(f"Processing local file path: {original_file_name}")
                    print(f"Current working directory: {os.getcwd()}")
                    print(f"File exists check: {os.path.exists(original_file_name)}")
                    
                    # Try multiple path resolution strategies
                    file_paths_to_try = [
                        original_file_name,  # Try the original path first
                        os.path.basename(original_file_name),  # Try just the filename
                        os.path.join(os.getcwd(), original_file_name),  # Try with current working directory
                        os.path.join(os.getcwd(), os.path.basename(original_file_name))  # Try filename in current directory
                    ]
                    
                    file_loaded = False
                    for file_path in file_paths_to_try:
                        print(f"Trying file path: {file_path}")
                        if os.path.exists(file_path):
                            df = pd.read_csv(file_path)
                            print(f"Successfully loaded data from local file: {file_path}")
                            file_loaded = True
                            break
                    
                    if not file_loaded:
                        print(f"Local file not found in any of the attempted paths: {file_paths_to_try}. Creating mock dataset...")
                        raise FileNotFoundError(f"File not found in any attempted paths: {file_paths_to_try}")
                        
            except Exception as e:
                print(f"Failed to load CSV data from JSON file_name: {e}")
                print("Creating mock dataset based on column mapping to avoid file dependency issues...")
                
                # Create a mock dataset based on the column mapping
                df_col_small = df_col_df[df_col_df['datatype'].isin(['numerical', 'categorical'])]
                mock_data = {}
                
                for _, row in df_col_small.iterrows():
                    col_name = row['column_name']
                    if row['datatype'] == 'numerical':
                        mock_data[col_name] = [0.0] * 100  # Create 100 rows of zeros
                    else:  # categorical
                        mock_data[col_name] = ['category1'] * 100  # Create 100 rows of category1
                
                # Add the target variable
                if state.badflag not in mock_data:
                    mock_data[state.badflag] = [0] * 100  # Create 100 rows of zeros
                
                df = pd.DataFrame(mock_data)
                print(f"Created mock dataset with shape: {df.shape}")
                print(f"Mock data columns: {list(df.columns)}")
        else:
            # Original logic for non-CSV files - skip data loading for now
            print("Non-CSV file detected - skipping data loading")
            # For non-CSV files, we'll use the existing logic
            pass
        
        # Verify all required columns exist
        df_col_small = df_col_df[df_col_df['datatype'].isin(['numerical', 'categorical'])]
        print(f"Columns to use for tree: {list(df_col_small.column_name)}")
        
        # Check if all required columns exist
        missing_cols = [col for col in df_col_small.column_name if col not in df.columns]
        if missing_cols:
            print(f"Adding missing columns: {missing_cols}")
            for col in missing_cols:
                df[col] = [0.0] * 100  # Add missing columns
        
        # Check if badflag column exists
        if state.badflag not in df.columns:
            print(f"Adding missing badflag column: {state.badflag}")
            df[state.badflag] = [0] * 100
        
        df_for_tree = df[df_col_small.column_name]
        df_for_tree['badflag'] = df[state.badflag]
        
        print(f"Final df_for_tree columns: {list(df_for_tree.columns)}")
        print(f"Final df_for_tree shape: {df_for_tree.shape}")
        
        # Check if variables in node_master exist in the dataset
        if 'variable' in node_master_read.columns:
            node_variables = node_master_read['variable'].dropna().unique()
            missing_vars = [var for var in node_variables if var not in df_for_tree.columns and var not in ['Parent', '']]
            if missing_vars:
                return handle_error(f"Variables in tree not found in data: {missing_vars}. Available columns: {list(df_for_tree.columns)}", 400)
        
        print(f"About to call create_node_datasets...")
        print(f"df_for_tree columns: {list(df_for_tree.columns)}")
        print(f"df_for_tree shape: {df_for_tree.shape}")
        print(f"node_master_read columns: {list(node_master_read.columns)}")
        print(f"node_master_read shape: {node_master_read.shape}")
        
        # Persist the heavy frames to the DataFrameStore (single load -> set_dataframe).
        print("Initializing session state for imported tree...")
        state.df_key = session_manager.set_dataframe(sid, state, "df", df)
        state.df_for_tree_key = session_manager.set_dataframe(sid, state, "df_for_tree", df_for_tree)
        
        # ``node_datasets`` is transient and rederived on demand via
        # ``session_manager.node_datasets_for`` -- it is intentionally NOT
        # persisted here. The persisted artifacts are node_master, df_col,
        # df_for_tree_key, and X_col.
        print("node_datasets will be rederived on demand (not persisted)")
        
        # Set X_col (feature columns excluding the target variable)
        print(f"Setting X_col...")
        print(f"df_for_tree columns: {list(df_for_tree.columns)}")
        print(f"badflag: '{state.badflag}'")
        print(f"badflag in columns: {state.badflag in df_for_tree.columns}")
        
        # Always exclude the target variable from feature columns
        # Use the mapper to determine feature columns (exclude target variable)
        df_col_small = df_col_df[df_col_df['datatype'].isin(['numerical', 'categorical'])]
        feature_columns = df_col_small['column_name'].tolist()
        
        print(f"Feature columns from mapper: {feature_columns}")
        
        # Ensure all feature columns exist in df_for_tree
        available_features = [col for col in feature_columns if col in df_for_tree.columns]
        print(f"Available feature columns: {available_features}")
        
        if available_features:
            state.X_col = list(available_features)
            print(f"X_col set from mapper features: {list(state.X_col)}")
        else:
            # Fallback: exclude target variable from all columns
            if state.badflag in df_for_tree.columns:
                state.X_col = list(df_for_tree.drop([state.badflag], axis=1).columns)
                print(f"X_col set by dropping badflag: {list(state.X_col)}")
            else:
                print(f"Warning: badflag '{state.badflag}' not in df_for_tree columns, using all columns")
                state.X_col = list(df_for_tree.columns)
        
        print(f"Final X_col: {list(state.X_col)}")
        
        # Persist node_master (as JSON) and the rest of the session state.
        state.node_master = df_to_json_safe(node_master_read)
        session_manager.persist(sid, state)
        
        return jsonify({"node_master": df_to_json_safe(node_master_read)})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/getImportDiagnostics', methods=['GET'])
@jwt_required()
def getImportDiagnostics():
    """Get diagnostic information about the imported tree data"""
    try:
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.df_key is None:
            return handle_error("No data available. Please import a tree first.", 400)

        df = session_manager.active_df(state)
        if df is None:
            return handle_error("No data available. Please import a tree first.", 400)
        
        # Get sample records (first 5 rows)
        sample_records = df.head(5).replace({pd.NA: None, pd.NaT: None, np.nan: None}).to_dict(orient='records')
        
        # Get column information
        columns_info = []
        for col in df.columns:
            dtype = str(df[col].dtype)
            unique_count = df[col].nunique()
            columns_info.append({
                'column_name': col,
                'datatype': dtype,
                'unique_values': unique_count,
                'sample_values': df[col].head(3).replace({pd.NA: None, pd.NaT: None, np.nan: None}).tolist()
            })
        
        # Get mapper information
        mapper_info = []
        if state.df_col is not None:
            for row in pd.DataFrame(state.df_col).to_dict('records'):
                mapper_info.append({
                    'column_name': row['column_name'],
                    'datatype': row['datatype']
                })
        
        df_for_tree = (
            session_manager.active_df_for_tree(state)
            if state.df_for_tree_key else None
        )
        diagnostics = {
            'dataset_info': {
                'rows': df.shape[0],
                'columns': df.shape[1],
                'sample_records': sample_records
            },
            'target_variable': state.badflag,
            'columns_info': columns_info,
            'mapper_info': mapper_info,
            'hyperparameters': {
                'max_depth': state.max_depth,
                'min_node_split': state.min_node_split,
                'min_leaf_size': state.min_leaf_size,
                'max_branches': state.max_branches,
                'criteria': state.criteria,
                'unique_var': state.unique_var,
                'monotonic': state.monotonic,
                'regression_flag': state.regression_flag
            },
            'feature_columns': list(state.X_col) if state.X_col else [],
            'df_for_tree_shape': df_for_tree.shape if df_for_tree is not None else None
        }
        
        return jsonify(diagnostics)
    
    except Exception as e:
        print(f"Error in getImportDiagnostics: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return handle_storage_error(e)

@app.route('/api/upload', methods=['POST'])
@jwt_required()
def upload_csv():
    """Upload and validate CSV file"""
    try:
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        # ``df`` / ``source`` capture the loaded frame and its original source so
        # the heavy frame is persisted via the DataFrameStore (not the global).
        df = None
        source = None

        # Check if this is a file upload (multipart/form-data) or JSON request
        if request.files:
            # Handle file upload
            uploaded_file = request.files.get('file')
            if not uploaded_file:
                return handle_error("No file provided in upload", 400)
            
            if not uploaded_file.filename.endswith('.csv'):
                return handle_error("Only CSV files are allowed", 400)
            
            # Save uploaded file to temporary directory
            import tempfile
            
            # Create uploads directory if it doesn't exist
            upload_dir = os.path.join(os.getcwd(), 'uploads')
            os.makedirs(upload_dir, exist_ok=True)
            
            # Generate unique filename
            import uuid
            unique_filename = f"{uuid.uuid4()}_{uploaded_file.filename}"
            file_path = os.path.join(upload_dir, unique_filename)
            
            # Save the file
            uploaded_file.save(file_path)
            
            # Load CSV file
            df = pd.read_csv(file_path)
            source = file_path  # Store full path to saved file
            
        else:
            # Handle JSON request (existing file path or URL)
            data = request.get_json()
            if not data:
                return handle_error("No JSON data provided", 400)
            
            # Validate required fields
            is_valid, error_msg = validate_required_fields(data, ["file"])
            if not is_valid:
                return handle_error(error_msg, 400)
            
            file_name = data.get("file")
            
            # Check if it's an S3 path
            if is_s3_path(file_name):
                # Handle S3 - download the file
                try:
                    # Create uploads directory if it doesn't exist
                    upload_dir = os.path.join(os.getcwd(), 'uploads')
                    os.makedirs(upload_dir, exist_ok=True)
                    
                    # Generate unique filename
                    import uuid
                    unique_filename = f"{uuid.uuid4()}_s3_downloaded.csv"
                    file_path = os.path.join(upload_dir, unique_filename)
                    
                    # Download from S3
                    download_from_s3(file_name, file_path)
                    
                    # Load CSV file
                    df = pd.read_csv(file_path)
                    source = file_name  # Store original S3 path
                    
                except Exception as e:
                    return handle_error(f"Failed to download file from S3: {str(e)}", 400)
            # Check if it's a URL or local file path
            elif file_name.startswith(('http://', 'https://')):
                # Handle URL - download the file
                import requests
                import tempfile
                
                try:
                    response = requests.get(file_name)
                    response.raise_for_status()
                    
                    # Create uploads directory if it doesn't exist
                    upload_dir = os.path.join(os.getcwd(), 'uploads')
                    os.makedirs(upload_dir, exist_ok=True)
                    
                    # Generate unique filename
                    import uuid
                    unique_filename = f"{uuid.uuid4()}_downloaded.csv"
                    file_path = os.path.join(upload_dir, unique_filename)
                    
                    # Save downloaded file
                    with open(file_path, 'wb') as f:
                        f.write(response.content)
                    
                    # Load CSV file
                    df = pd.read_csv(file_path)
                    source = file_name  # Store original URL
                    
                except requests.RequestException as e:
                    return handle_error(f"Failed to download file from URL: {str(e)}", 400)
            else:
                # Handle local file path
                # Try multiple path resolution strategies
                file_paths_to_try = [
                    file_name,  # Try the original path first
                    os.path.basename(file_name),  # Try just the filename
                    os.path.join(os.getcwd(), file_name),  # Try with current working directory
                    os.path.join(os.getcwd(), os.path.basename(file_name))  # Try filename in current directory
                ]
                
                file_loaded = False
                for file_path in file_paths_to_try:
                    if os.path.exists(file_path):
                        df = pd.read_csv(file_path)
                        source = file_name  # Store original file path
                        file_loaded = True
                        break
                
                if not file_loaded:
                    return handle_error(f"File not found in any attempted paths: {file_paths_to_try}", 404)

        # Persist the heavy frame to the DataFrameStore; keep only the key +
        # small metadata in the session. ``file_path`` is the local saved path
        # in every branch above; ``source`` is the original upload source.
        state.df_key = session_manager.set_dataframe(sid, state, "df", df)
        state.file_name = file_path
        state.original_data_source = source
        session_manager.persist(sid, state)

        rows, columns = df.shape
        sample = df.head().replace({pd.NA: None, pd.NaT: None, np.nan: None}).to_dict(orient='records')
        column_names = df.columns.tolist()
        
        return jsonify({
            'rows': rows,
            'columns': columns,
            'sample': sample,
            'columnsList': column_names
        })
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/setTarget', methods=['POST'])
@jwt_required()
def setTarget():
    """Set target variable for the decision tree"""
    try:
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        # Validate required fields
        is_valid, error_msg = validate_required_fields(data, ["target"])
        if not is_valid:
            return handle_error(error_msg, 400)
        
        target = data.get("target")
        regression_flag = data.get("regression_flag")
        
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        # Validate target exists in dataframe
        df = session_manager.active_df(state)
        if df is None:
            return handle_error("No data loaded. Please upload a file first.", 400)
        
        if target not in df.columns:
            return handle_error(f"Target variable '{target}' not found in data", 400)
        
        state.badflag = target
        state.regression_flag = regression_flag
        session_manager.persist(sid, state)
        
        return jsonify({"message": f"Target variable set to {target}"})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/getRegressionFlag', methods=['GET'])
@jwt_required()
def getRegressionFlag():
    """Return current regression/classification mode flag"""
    try:
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)
        return jsonify({"regression_flag": state.regression_flag})
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/getTypes', methods=['GET'])
@jwt_required()
def getTypes():
    """Get data types for all columns except target variable"""
    try:
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        df = session_manager.active_df(state)
        if df is None:
            return handle_error("No data loaded. Please upload a file first.", 400)
        
        if state.badflag is None:
            return handle_error("No target variable set. Please set target variable first.", 400)
        
        col_types = {
            col: classify_dtype(df.drop(state.badflag, axis=1)[col].dtype) 
            for col in df.drop(state.badflag, axis=1).columns
        }
        
        return jsonify(col_types)
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/keepVar', methods=['POST'])
@jwt_required()
def keepVar():
    """Select variables to keep for tree building"""
    try:
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        df = session_manager.active_df(state)
        if df is None:
            return handle_error("No data loaded. Please upload a file first.", 400)
        
        if state.badflag is None:
            return handle_error("No target variable set. Please set target variable first.", 400)
        
        df_col = pd.DataFrame(list(data.items()), columns=['column_name', 'datatype'])
        print(f"df_col created: {df_col}")
        # Persist the mapper as JSON-serializable rows on the session.
        state.df_col = df_col.to_dict('records')
        
        df_col_small = df_col[df_col['datatype'].isin(['numerical', 'categorical'])]
        print(f"df_col_small after filtering: {df_col_small}")
        
        # Convert to list to ensure proper column selection
        feature_columns = df_col_small['column_name'].tolist()
        print(f"Feature columns to use: {feature_columns}")
        
        df_for_tree = df[feature_columns]
        print(f"df_for_tree columns after feature selection: {list(df_for_tree.columns)}")
        
        # Convert target variable to numeric (0/1) for tree building
        target_values = df[state.badflag]
        if target_values.dtype == 'object':
            # Convert string values to numeric (Yes/No -> 1/0)
            unique_values = target_values.unique()
            if len(unique_values) == 2:
                # Create mapping: first unique value -> 1, second -> 0
                value_map = {unique_values[0]: 1, unique_values[1]: 0}
                df_for_tree['badflag'] = target_values.map(value_map)
            else:
                return handle_error(f"Target variable must have exactly 2 unique values, found {len(unique_values)}", 400)
        else:
            # Already numeric
            df_for_tree['badflag'] = target_values
        
        # Persist the processed heavy frame to the DataFrameStore.
        state.df_for_tree_key = session_manager.set_dataframe(sid, state, "df_for_tree", df_for_tree)
        session_manager.persist(sid, state)
        
        column_names = df_for_tree.columns.tolist()
        return jsonify({'columnsList': column_names})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/defineHP', methods=['POST'])
@jwt_required()
def defineHP():
    """Define hyperparameters for decision tree"""
    try:
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        # Set default values
        state.max_depth = 5
        state.min_node_split = 500
        state.min_leaf_size = 100
        state.max_branches = 5
        state.criteria = "entropy"
        state.unique_var = 0
        state.monotonic = 0
        
        # Override with provided values
        data = request.get_json(silent=True) or {}
        state.max_depth = data.get("max_depth", state.max_depth)
        state.min_node_split = data.get("min_node_split", state.min_node_split)
        state.min_leaf_size = data.get("min_leaf_size", state.min_leaf_size)
        state.max_branches = data.get("max_branches", state.max_branches)
        state.criteria = data.get("criteria", state.criteria)
        state.unique_var = data.get("unique_var", state.unique_var)
        state.monotonic = data.get("monotonic", state.monotonic)
        
        session_manager.persist(sid, state)
        
        return jsonify({
            'max_depth': state.max_depth,
            'min_node_split': state.min_node_split,
            'min_leaf_size': state.min_leaf_size,
            'max_branches': state.max_branches,
            'criteria': state.criteria,
            'unique_var': state.unique_var,
            'monotonic': state.monotonic
        })
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/initTree', methods=['POST'])
@jwt_required()
def initTree():
    """Initialize decision tree with root node"""
    try:
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        df_for_tree = session_manager.active_df_for_tree(state)
        if df_for_tree is None:
            return handle_error("No processed data available. Please complete data setup first.", 400)

        X_col, node_master, node_datasets = init_setup(
            df_for_tree, 'badflag', state.max_depth,
            state.min_node_split, state.min_leaf_size, state.max_branches
        )

        # node_datasets is rederivable and intentionally not persisted.
        state.X_col = list(X_col)
        state.node_master = df_to_json_safe(node_master)
        session_manager.persist(sid, state)

        return jsonify({"node_master": df_to_json_safe(node_master)})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/autoTree', methods=['POST'])
@jwt_required()
def autoTree():
    """Train entire tree automatically"""
    try:
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        df_for_tree = session_manager.active_df_for_tree(state)
        if df_for_tree is None:
            return handle_error("No processed data available. Please complete data setup first.", 400)

        node_master, node_datasets = build_tree(
            df_for_tree, 'badflag', state.max_depth,
            state.min_node_split, state.min_leaf_size,
            state.max_branches, pd.DataFrame(state.df_col), state.regression_flag,
            state.monotonic, state.unique_var
        )

        state.node_master = df_to_json_safe(node_master)
        session_manager.persist(sid, state)

        return jsonify({"node_master": df_to_json_safe(node_master)})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/delSubTree', methods=['POST'])
@jwt_required()
def delSubTree():
    """Delete subtree starting from specified node"""
    try:
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        # Validate required fields
        is_valid, error_msg = validate_required_fields(data, ["node_number"])
        if not is_valid:
            return handle_error(error_msg, 400)
        
        node_number = data.get("node_number")
        
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.node_master is None or state.df_for_tree_key is None:
            return handle_error("No tree initialized. Please initialize tree first.", 400)

        node_master_df = pd.DataFrame(state.node_master)
        node_datasets = session_manager.node_datasets_for(state)

        node_master_df, node_datasets = del_subtree(
            node_master_df, node_datasets, node_number
        )
        
        # After deleting subtree, ensure the parent node is marked as a non-leaf node
        # This is crucial for auto training to work properly
        if node_number in node_master_df['node_number'].values:
            print(f"Marking node {node_number} as non-leaf after deleting subtree")
            node_master_df.loc[node_master_df['node_number'] == node_number, 'leaf_flag'] = 0
            print(f"Node {node_number} leaf_flag set to 0")
        
        # After deleting subtree, ensure all remaining data is assigned to the root node
        # This is crucial for auto training to work properly.
        # node_datasets is transient (never persisted); this reassignment only
        # affects the in-request computation. The persisted leaf_flag mutation on
        # node_master_df is what matters across requests.
        if node_number == 1:  # If deleting from root node
            print("Deleting subtree from root node - reassigning all data to root node")
            node_datasets = session_manager.active_df_for_tree(state).copy()
            node_datasets['node_number'] = 1
            print(f"Reassigned all data to root node. node_datasets shape: {node_datasets.shape}")

        state.node_master = df_to_json_safe(node_master_df)
        session_manager.persist(sid, state)

        return jsonify({"node_master": df_to_json_safe(node_master_df)})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/autoTrainSubTree', methods=['POST'])
@jwt_required()
def autoTrainSubTree():
    """Automatically train subtree from specified node"""
    try:
        print("=== AUTO TRAIN SUBTREE ENDPOINT CALLED ===")
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        # Validate required fields
        is_valid, error_msg = validate_required_fields(data, ["node_number"])
        if not is_valid:
            return handle_error(error_msg, 400)
        
        node_number = data.get("node_number")
        print(f"Processing auto train for node: {node_number}")
        
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.node_master is None or state.df_for_tree_key is None:
            return handle_error("No tree initialized. Please initialize tree first.", 400)

        node_master_df = pd.DataFrame(state.node_master)

        # Check if the node exists in node_master
        if node_number not in node_master_df['node_number'].values:
            return handle_error(f"Node {node_number} not found in tree", 400)

        # Check if required state variables are set
        if state.df_for_tree_key is None:
            return handle_error("Data for tree not available", 400)
        if state.X_col is None:
            return handle_error("Feature columns not defined", 400)
        if state.df_col is None:
            return handle_error("Column mapping not available", 400)

        df_for_tree = session_manager.active_df_for_tree(state)
        node_datasets = session_manager.node_datasets_for(state)
        df_col_df = pd.DataFrame(state.df_col)

        print(f"Auto training subtree for node {node_number}")
        print(f"Node master shape: {node_master_df.shape}")
        print(f"Node datasets shape: {node_datasets.shape}")
        print(f"df_for_tree shape: {df_for_tree.shape}")
        print(f"X_col: {list(state.X_col)}")
        print(f"df_col shape: {df_col_df.shape}")

        print("About to call build_tree_node...")
        node_master_df, node_datasets = build_tree_node(
            df_for_tree, 'badflag', state.max_depth,
            state.min_node_split, state.min_leaf_size,
            state.max_branches, node_number, state.X_col,
            node_master_df, node_datasets, df_col_df, state.regression_flag
        )
        print("build_tree_node completed successfully")

        state.node_master = df_to_json_safe(node_master_df)
        session_manager.persist(sid, state)

        return jsonify({"node_master": df_to_json_safe(node_master_df)})
    
    except Exception as e:
        print(f"Error in autoTrainSubTree: {str(e)}")
        print(f"Exception type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return handle_error(f"Auto train failed: {str(e)}")

@app.route('/api/findSplit', methods=['POST'])
@jwt_required()
def findSplit():
    """Find best split for specified node"""
    try:
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        # Validate required fields
        is_valid, error_msg = validate_required_fields(data, ["node_number"])
        if not is_valid:
            return handle_error(error_msg, 400)
        
        node_number = data.get("node_number")
        
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.node_master is None or state.df_for_tree_key is None:
            return handle_error("No tree initialized. Please initialize tree first.", 400)

        node_master_df = pd.DataFrame(state.node_master)
        node_datasets = session_manager.node_datasets_for(state)
        df_col_df = pd.DataFrame(state.df_col)

        node_master_df, node_datasets = split_node(
            node_number, state.min_leaf_size, state.max_branches,
            state.max_depth, state.min_node_split, state.X_col,
            node_master_df, node_datasets, 'badflag', df_col_df, state.regression_flag,
            state.monotonic, []
        )

        state.node_master = df_to_json_safe(node_master_df)
        session_manager.persist(sid, state)

        return jsonify({"node_master": df_to_json_safe(node_master_df)})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/findVar', methods=['POST'])
@jwt_required()
def findVar():
    """Find top variables for splitting at specified node"""
    try:
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        # Validate required fields
        is_valid, error_msg = validate_required_fields(data, ["node_number"])
        if not is_valid:
            return handle_error(error_msg, 400)
        
        node_number = data.get("node_number")
        
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.node_master is None or state.df_for_tree_key is None:
            return handle_error("No tree initialized. Please initialize tree first.", 400)

        node_datasets = session_manager.node_datasets_for(state)
        df_col_df = pd.DataFrame(state.df_col)

        if state.regression_flag == 0:
            top_vars = find_var(
                node_number, node_datasets, state.X_col,
                'badflag', df_col_df
            )
        else:
            top_vars = find_var_regression(
                node_number, node_datasets, state.X_col,
                'badflag', df_col_df
            )

        return jsonify({"top_vars": df_to_json_safe(top_vars)})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/bestSplit', methods=['POST'])
@jwt_required()
def bestSplit():
    """Find best split for specified variable at specified node"""
    try:
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        # Validate required fields
        is_valid, error_msg = validate_required_fields(data, ["node_number", "variable_name"])
        if not is_valid:
            return handle_error(error_msg, 400)
        
        node_number = data.get("node_number")
        variable_name = data.get("variable_name")
        
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.node_master is None or state.df_for_tree_key is None:
            return handle_error("No tree initialized. Please initialize tree first.", 400)

        node_datasets = session_manager.node_datasets_for(state)
        df_col_df = pd.DataFrame(state.df_col)

        if state.regression_flag == 0:
            df_out = best_split(
                node_number, node_datasets, state.X_col,
                'badflag', variable_name, state.min_leaf_size,
                state.max_branches, df_col_df
            )
        else:
            df_out = best_split_regression(
                node_number, node_datasets, state.X_col,
                'badflag', variable_name, state.min_leaf_size,
                state.max_branches, df_col_df
            )

        return jsonify({"best_split": df_to_json_safe(df_out)})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/evalSplit', methods=['POST'])
@jwt_required()
def evalSplit():
    """Evaluate provided splits for specified node"""
    try:
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        # Validate required fields
        is_valid, error_msg = validate_required_fields(data, ["node_number", "variable_name", "splits"])
        if not is_valid:
            return handle_error(error_msg, 400)
        
        node_number = data.get("node_number")
        variable_name = data.get("variable_name")
        splits_data = data.get("splits")
        
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.node_master is None or state.df_for_tree_key is None:
            return handle_error("No tree initialized. Please initialize tree first.", 400)

        node_datasets = session_manager.node_datasets_for(state)
        df_col_df = pd.DataFrame(state.df_col)

        # Create DataFrame and add required columns
        df = pd.DataFrame(splits_data)
        
        # Add missing columns that eval_split expects
        df['variable'] = variable_name
        # Use missing values from input data if provided, otherwise default to False
        if 'missing' not in df.columns:
            df['missing'] = False  # Default to no missing values
        else:
            # Ensure missing values are integers (0/1)
            df['missing'] = df['missing'].astype(int)
        
        # For categorical variables, use the list_values from the input data
        if 'list_values' not in df.columns:
            df['list_values'] = [[] for _ in range(len(df))]  # Default empty list
        else:
            # Ensure list_values are properly formatted as flat lists of scalars
            def normalize_list_values(x):
                if x is None:
                    return []
                if isinstance(x, list):
                    # If contains numpy arrays/Series, flatten them
                    out = []
                    for v in x:
                        try:
                            import numpy as np
                            import pandas as pd
                            if isinstance(v, (np.ndarray, pd.Series)):
                                out.extend(list(v))
                            else:
                                out.append(v)
                        except Exception:
                            out.append(v)
                    return out
                try:
                    import numpy as np
                    import pandas as pd
                    if isinstance(x, (np.ndarray, pd.Series)):
                        return list(x)
                except Exception:
                    pass
                return [x]

            df['list_values'] = df['list_values'].apply(normalize_list_values)
        
        df_out = eval_split(node_number, node_datasets, 'badflag', df, df_col_df)
        
        return jsonify({"eval_split": df_to_json_safe(df_out)})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/addNode', methods=['POST'])
@jwt_required()
def addNode():
    """Add new nodes based on provided splits"""
    try:
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        # Validate required fields
        is_valid, error_msg = validate_required_fields(data, ["node_number", "variable_name", "splits"])
        if not is_valid:
            return handle_error(error_msg, 400)
        
        node_number = data.get("node_number")
        variable_name = data.get("variable_name")
        splits_data = data.get("splits")
        
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.node_master is None or state.df_for_tree_key is None:
            return handle_error("No tree initialized. Please initialize tree first.", 400)

        node_master_df = pd.DataFrame(state.node_master)
        node_datasets = session_manager.node_datasets_for(state)
        df_col_df = pd.DataFrame(state.df_col)

        # Create DataFrame and add required columns
        df = pd.DataFrame(splits_data)
        
        # Add missing columns that add_nodes expects
        df['variable'] = variable_name
        # Use missing values from input data if provided, otherwise default to 0
        if 'missing' not in df.columns:
            df['missing'] = 0  # Default to no missing values
        else:
            # Ensure missing values are integers (0/1)
            df['missing'] = df['missing'].astype(int)
        # Use list_values from input data if provided, otherwise default to empty list
        if 'list_values' not in df.columns:
            df['list_values'] = [[] for _ in range(len(df))]
        else:
            # Normalize list_values to flat lists of scalars
            def normalize_list_values(x):
                if x is None:
                    return []
                if isinstance(x, list):
                    out = []
                    for v in x:
                        try:
                            import numpy as np
                            import pandas as pd
                            if isinstance(v, (np.ndarray, pd.Series)):
                                out.extend(list(v))
                            else:
                                out.append(v)
                        except Exception:
                            out.append(v)
                    return out
                try:
                    import numpy as np
                    import pandas as pd
                    if isinstance(x, (np.ndarray, pd.Series)):
                        return list(x)
                except Exception:
                    pass
                return [x]

            df['list_values'] = df['list_values'].apply(normalize_list_values)
        
        node_master_df, node_datasets = add_nodes(
            df, node_number, state.max_depth, state.min_node_split,
            0, node_master_df, node_datasets, 'badflag', df_col_df
        )

        state.node_master = df_to_json_safe(node_master_df)
        session_manager.persist(sid, state)

        return jsonify({"success": True, "message": "Nodes added successfully", "node_master": df_to_json_safe(node_master_df)})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/copyNode', methods=['POST'])
@jwt_required()
def copyNode():
    """Copy subtree from one node to another"""
    try:
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        # Validate required fields
        is_valid, error_msg = validate_required_fields(data, ["from_node", "to_node"])
        if not is_valid:
            return handle_error(error_msg, 400)
        
        from_node = data.get("from_node")
        to_node = data.get("to_node")
        
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.node_master is None or state.df_for_tree_key is None:
            return handle_error("No tree initialized. Please initialize tree first.", 400)

        node_master_df = pd.DataFrame(state.node_master)
        node_datasets = session_manager.node_datasets_for(state)
        df_col_df = pd.DataFrame(state.df_col)

        node_master_df, node_datasets = copy_node_wrapper(
            from_node, to_node, node_master_df, node_datasets,
            state.max_depth, state.min_node_split, 'badflag', df_col_df
        )

        state.node_master = df_to_json_safe(node_master_df)
        session_manager.persist(sid, state)

        return jsonify({"node_master": df_to_json_safe(node_master_df)})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/labelNode', methods=['POST'])
@jwt_required()
def labelNode():
    """Add label to specified node"""
    try:
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        # Validate required fields
        is_valid, error_msg = validate_required_fields(data, ["node_number", "label"])
        if not is_valid:
            return handle_error(error_msg, 400)
        
        node_number = data.get("node_number")
        label = data.get("label")
        
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.node_master is None:
            return handle_error("No tree initialized. Please initialize tree first.", 400)

        node_master_df = pd.DataFrame(state.node_master)
        node_master_df = add_label(node_number, label, node_master_df)

        state.node_master = df_to_json_safe(node_master_df)
        session_manager.persist(sid, state)

        return jsonify({"node_master": df_to_json_safe(node_master_df)})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/exportTree', methods=['GET', 'POST'])
@jwt_required()
def exportTree():
    """Export current tree state as JSON. Optionally upload to S3 if s3_path is provided."""
    try:
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.node_master is None:
            return handle_error("No tree to export. Please initialize tree first.", 400)
        
        # Check if S3 path is provided
        s3_path = None
        if request.method == 'POST':
            data = request.get_json()
            if data and 's3_path' in data:
                s3_path = data.get('s3_path')
        
        # If S3 path provided, upload to S3
        if s3_path:
            if not is_s3_path(s3_path):
                return handle_error("Invalid S3 path format. Expected format: s3://bucket/key", 400)
            
            # Create temporary file with export data
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp_file:
                export_data = {
                    'file_name': state.original_data_source or state.file_name,
                    'badflag': state.badflag,
                    'max_depth': state.max_depth,
                    'min_node_split': state.min_node_split,
                    'min_leaf_size': state.min_leaf_size,
                    'max_branches': state.max_branches,
                    'criteria': state.criteria,
                    'unique_var': state.unique_var,
                    'monotonic': state.monotonic,
                    'mapper': df_to_json_safe(pd.DataFrame(state.df_col)),
                    'node_master': df_to_json_safe(pd.DataFrame(state.node_master))
                }
                json.dump(export_data, tmp_file, indent=2)
                tmp_path = tmp_file.name
            
            try:
                # Upload to S3
                upload_to_s3(tmp_path, s3_path)
                os.unlink(tmp_path)  # Clean up temp file
                return jsonify({
                    'message': f'Tree exported successfully to {s3_path}',
                    's3_path': s3_path,
                    'export_data': export_data
                })
            except Exception as e:
                os.unlink(tmp_path)  # Clean up temp file on error
                return handle_error(f"Failed to upload to S3: {str(e)}", 500)
        
        # Return JSON response
        return jsonify({
            'file_name': state.file_name,
            'badflag': state.badflag,
            'max_depth': state.max_depth,
            'min_node_split': state.min_node_split,
            'min_leaf_size': state.min_leaf_size,
            'max_branches': state.max_branches,
            'criteria': state.criteria,
            'unique_var': state.unique_var,
            'monotonic': state.monotonic,
            'mapper': df_to_json_safe(pd.DataFrame(state.df_col)),
            'node_master': df_to_json_safe(pd.DataFrame(state.node_master))
        })
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/downloadTree', methods=['GET', 'POST'])
@jwt_required()
def downloadTree():
    """Download current tree state as JSON file. Optionally upload to S3 if s3_path is provided."""
    try:
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.node_master is None:
            return handle_error("No tree to download. Please initialize tree first.", 400)
        
        # Check if S3 path is provided
        s3_path = None
        if request.method == 'POST':
            data = request.get_json()
            if data and 's3_path' in data:
                s3_path = data.get('s3_path')
        elif request.method == 'GET':
            s3_path = request.args.get('s3_path')
        
        data = {
            'file_name': state.original_data_source or state.file_name,  # Use original data source if available
            'badflag': state.badflag,
            'max_depth': state.max_depth,
            'min_node_split': state.min_node_split,
            'min_leaf_size': state.min_leaf_size,
            'max_branches': state.max_branches,
            'criteria': state.criteria,
            'unique_var': state.unique_var,
            'monotonic': state.monotonic,
            'mapper': df_to_json_safe(pd.DataFrame(state.df_col)),
            'node_master': df_to_json_safe(pd.DataFrame(state.node_master))
        }
        
        # If S3 path provided, upload to S3
        if s3_path:
            if not is_s3_path(s3_path):
                return handle_error("Invalid S3 path format. Expected format: s3://bucket/key", 400)
            
            # Create temporary file with export data
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp_file:
                json.dump(data, tmp_file, indent=2)
                tmp_path = tmp_file.name
            
            try:
                # Upload to S3
                upload_to_s3(tmp_path, s3_path)
                os.unlink(tmp_path)  # Clean up temp file
                return jsonify({
                    'message': f'Tree downloaded successfully to {s3_path}',
                    's3_path': s3_path
                })
            except Exception as e:
                os.unlink(tmp_path)  # Clean up temp file on error
                return handle_error(f"Failed to upload to S3: {str(e)}", 500)
        
        # Return file download
        json_str = json.dumps(data, indent=2)
        response = Response(
            json_str,
            mimetype="application/json",
            headers={"Content-Disposition": "attachment;filename=tree_export.json"}
        )
        return response
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/getTreeData', methods=['GET'])
@jwt_required()
def getTreeData():
    """Get current tree data"""
    try:
        sid = session_id_from_jwt()
        state = session_manager.resolve(sid)

        if state.node_master is None:
            return handle_error("No tree data available. Please build a tree first.", 400)

        # state.node_master is already a JSON-safe list of records.
        return jsonify({"node_master": state.node_master})
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/uploadFileToS3', methods=['POST'])
@jwt_required()
def uploadFileToS3():
    """Upload file content to S3"""
    try:
        data = request.get_json()
        if not data:
            return handle_error("No JSON data provided", 400)
        
        # Validate required fields
        is_valid, error_msg = validate_required_fields(data, ["content", "filename", "s3_path"])
        if not is_valid:
            return handle_error(error_msg, 400)
        
        content = data.get("content")
        filename = data.get("filename")
        content_type = data.get("content_type", "text/plain")
        s3_path = data.get("s3_path")
        
        # Validate S3 path
        if not is_s3_path(s3_path):
            return handle_error("Invalid S3 path format. Expected format: s3://bucket/key", 400)
        
        # Create temporary file with content
        import tempfile
        import base64
        
        # Handle base64 content for binary files (images)
        if content_type.startswith('image/'):
            # Content is base64 encoded, decode it first
            try:
                # Remove data URL prefix if present
                if ',' in content:
                    base64_content = content.split(',')[1]
                else:
                    base64_content = content
                decoded_content = base64.b64decode(base64_content)
                with tempfile.NamedTemporaryFile(mode='wb', suffix=f"_{filename}", delete=False) as tmp_file:
                    tmp_file.write(decoded_content)
                    tmp_path = tmp_file.name
            except Exception as e:
                return handle_error(f"Invalid base64 content: {str(e)}", 400)
        else:
            # Regular text content
            with tempfile.NamedTemporaryFile(mode='w', suffix=f"_{filename}", delete=False, encoding='utf-8') as tmp_file:
                tmp_file.write(content)
                tmp_path = tmp_file.name
        
        try:
            # Upload to S3
            upload_to_s3(tmp_path, s3_path)
            os.unlink(tmp_path)  # Clean up temp file
            return jsonify({
                'message': f'File uploaded successfully to {s3_path}',
                's3_path': s3_path
            })
        except Exception as e:
            os.unlink(tmp_path)  # Clean up temp file on error
            return handle_error(f"Failed to upload to S3: {str(e)}", 500)
    
    except Exception as e:
        return handle_storage_error(e)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "message": "Decision Tree API is running"})

if __name__ == "__main__":
    # Development server only
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    port = int(os.getenv('FLASK_PORT', '5000'))
    app.run(debug=debug_mode, host='0.0.0.0', port=port)