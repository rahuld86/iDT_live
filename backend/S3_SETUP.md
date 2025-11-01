# S3 Setup and Connectivity Guide

This guide explains how to configure and verify S3 connectivity for importing and exporting files.

## Prerequisites

1. **AWS Account** with access to S3
2. **AWS Access Key ID** and **Secret Access Key** with S3 permissions
3. **boto3** installed (already included in `requirements.txt`)

## Configuration

### 1. Set AWS Credentials

Add the following to your `.env` file in the backend directory:

```bash
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1  # or your preferred region
```

**Important:** 
- Replace `your_access_key_here` and `your_secret_key_here` with your actual AWS credentials
- Keep your `.env` file secure and never commit it to version control

### 2. IAM Permissions

Your AWS user/role needs the following S3 permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name/*",
        "arn:aws:s3:::your-bucket-name"
      ]
    }
  ]
}
```

Replace `your-bucket-name` with your actual S3 bucket name.

## Usage

### Importing from S3

In the frontend, use the S3 path format:
```
s3://bucket-name/path/to/file.csv
```

Examples:
- `s3://my-data-bucket/training_data.csv`
- `s3://my-data-bucket/subfolder/data.csv`

### Exporting to S3

When exporting, you can specify an S3 path in the export dialog:
```
s3://bucket-name/path/to/export.json
```

## Verifying S3 Connectivity

### Quick Test

Test S3 connectivity using Python:

```python
import boto3
import os
from dotenv import load_dotenv

load_dotenv()

# Test S3 client initialization
try:
    s3_client = boto3.client(
        's3',
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('AWS_REGION', 'us-east-1')
    )
    print("✓ S3 client initialized successfully")
    
    # Test listing buckets
    buckets = s3_client.list_buckets()
    print(f"✓ Successfully connected to S3. Found {len(buckets['Buckets'])} buckets")
    
    # Test access to a specific bucket (replace with your bucket name)
    # test_bucket = 'your-bucket-name'
    # try:
    #     s3_client.head_bucket(Bucket=test_bucket)
    #     print(f"✓ Successfully accessed bucket: {test_bucket}")
    # except Exception as e:
    #     print(f"✗ Cannot access bucket {test_bucket}: {e}")
    
except Exception as e:
    print(f"✗ Failed to initialize S3 client: {e}")
    print("\nTroubleshooting:")
    print("1. Check that AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in .env")
    print("2. Verify the credentials are valid")
    print("3. Ensure boto3 is installed: pip install boto3")
```

### Test via Backend API

Test S3 import via the API:

```bash
curl -X POST http://localhost:5000/api/upload \
  -H "Content-Type: application/json" \
  -d '{"file": "s3://your-bucket-name/path/to/file.csv"}'
```

If successful, you'll receive a JSON response with sample data. If it fails, check the error message.

## Troubleshooting

### Error: "S3 support not available"

**Cause:** boto3 is not installed

**Fix:**
```bash
cd backend
pip install boto3
```

### Error: "Could not initialize S3 client"

**Causes:**
1. AWS credentials not set in `.env`
2. Invalid credentials
3. Missing environment variables

**Fix:**
1. Verify `.env` file exists in the backend directory
2. Check that `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` are set
3. Verify credentials are correct (no extra spaces or quotes)
4. Restart the backend server after updating `.env`

### Error: "Failed to download from S3"

**Causes:**
1. Invalid S3 path format
2. Bucket doesn't exist
3. File doesn't exist in the specified path
4. Insufficient permissions

**Fix:**
1. Verify S3 path format: `s3://bucket-name/path/to/file.csv`
2. Check that the bucket exists
3. Verify the file path is correct (case-sensitive)
4. Ensure your AWS user has `s3:GetObject` permission for the bucket

### Error: "Access Denied"

**Cause:** Insufficient IAM permissions

**Fix:**
1. Check IAM policy includes `s3:GetObject` and `s3:PutObject`
2. Verify the bucket policy allows your user/role
3. Check bucket ACLs if using ACLs

### Error: "NoCredentialsError"

**Cause:** AWS credentials not found

**Fix:**
1. Verify `.env` file is in the backend directory
2. Check that credentials are set correctly
3. Ensure `load_dotenv()` is called in `app.py`
4. Restart the backend server

## Security Best Practices

1. **Never commit `.env` files** to version control
2. **Use IAM roles** instead of access keys when possible (EC2, ECS, Lambda)
3. **Limit permissions** to only what's needed (principle of least privilege)
4. **Rotate credentials** regularly
5. **Use environment-specific credentials** (dev, staging, production)

## Example .env Entry

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
```

**Note:** These are example values. Use your actual credentials.

