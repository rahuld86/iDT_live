# S3 import/export on EC2

This application's S3 file import/export uses Boto3. EC2 and S3 being in the same
AWS account does not grant access automatically.

## Recommended: EC2 IAM role

1. Create an IAM role trusted by EC2.
2. Grant object reads/writes on your bucket/prefix. For example:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/YOUR_PREFIX/*"
    }
  ]
}
```

If separate operational tools list the prefix, add s3:ListBucket on the bucket
ARN with an appropriate prefix condition. The app's direct object reads/writes
do not inherently require listing the whole bucket. For SSE-KMS, grant the
necessary kms:Decrypt / kms:GenerateDataKey permissions and key-policy access.

3. Attach the role: EC2 -> Instances -> select instance -> Actions -> Security ->
   Modify IAM role.
4. Remove AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY from .env, including old
   placeholders. Check other credential providers for unwanted overrides.
5. Set AWS_REGION to your bucket's region and restart decision-tree-api.

Boto3 automatically obtains/refreshes role credentials. No permanent keys are
required. See [AWS role guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2.html)
and [Boto3 credentials](https://docs.aws.amazon.com/boto3/latest/guide/credentials.html).

## Verify the identity and access

If AWS CLI is installed, run as the same ubuntu user used by the service:

```bash
aws sts get-caller-identity
aws s3api head-object --bucket YOUR_BUCKET --key YOUR_PREFIX/known-file.csv
```

The first command identifies the credentials in use; the second checks metadata
for a known object. A successful identity check alone does not prove read/write
permission. Test an actual CSV import and an export to a dedicated test prefix in
the application to exercise both paths.

Use s3://YOUR_BUCKET/YOUR_PREFIX/file.csv for input or a suitable output file
path for exports. Ensure bucket/key spelling, region, policies and KMS match.
Do not assume missing-object errors always distinguish absence from access denial.

## Other credential providers

Outside EC2, use your approved SDK credential provider. If an IAM user's static
keys are explicitly required, set both values securely; do not use root keys.
The secret is only available when created. Never commit or share credentials.

Local CSV uploads/login do not require AWS keys. Keep DF_STORE_BACKEND=disk:
the separate heavy DataFrame S3 storage implementation is not available yet.
