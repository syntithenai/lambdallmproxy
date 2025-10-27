# Image Editor - Deployment Guide

## Infrastructure Requirements

### AWS Resources

```yaml
Resources:
  # 1. Image Processing Lambda Function
  ImageProcessorFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: lambdallmproxy-image-processor
      Runtime: nodejs20.x
      Handler: index.handler
      Code:
        S3Bucket: lambda-deployment-bucket
        S3Key: image-processor.zip
      MemorySize: 2048  # 2GB for image processing
      Timeout: 300      # 5 minutes
      EphemeralStorage:
        Size: 2048      # 2GB temp storage
      Environment:
        Variables:
          S3_BUCKET: generated-images-bucket
          DYNAMODB_TABLE: image-edit-sessions
      Layers:
        - !Ref ImageMagickLayer
        - !Ref SharpLayer
      Role: !GetAtt ImageProcessorRole.Arn
      
  # 2. ImageMagick Lambda Layer
  ImageMagickLayer:
    Type: AWS::Lambda::LayerVersion
    Properties:
      LayerName: imagemagick-7
      Description: ImageMagick 7.x compiled for Amazon Linux 2
      Content:
        S3Bucket: lambda-layers-bucket
        S3Key: imagemagick-7-layer.zip
      CompatibleRuntimes:
        - nodejs20.x
        - nodejs18.x
        
  # 3. Sharp Node Module Layer
  SharpLayer:
    Type: AWS::Lambda::LayerVersion
    Properties:
      LayerName: sharp
      Description: Sharp image processing library
      Content:
        S3Bucket: lambda-layers-bucket
        S3Key: sharp-layer.zip
      CompatibleRuntimes:
        - nodejs20.x
        
  # 4. S3 Bucket for Generated Images
  GeneratedImagesBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: generated-images-bucket
      VersioningConfiguration:
        Status: Enabled
      LifecycleConfiguration:
        Rules:
          - Id: DeleteOldImages
            Status: Enabled
            ExpirationInDays: 30
      CorsConfiguration:
        CorsRules:
          - AllowedOrigins: ['*']
            AllowedMethods: [GET, HEAD]
            AllowedHeaders: ['*']
            MaxAge: 3600
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        IgnorePublicAcls: true
        BlockPublicPolicy: false
        RestrictPublicBuckets: false
        
  # 5. DynamoDB Table for Sessions
  ImageEditSessionsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: image-edit-sessions
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: sessionId
          AttributeType: S
        - AttributeName: userId
          AttributeType: S
        - AttributeName: createdAt
          AttributeType: N
      KeySchema:
        - AttributeName: sessionId
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: userId-createdAt-index
          KeySchema:
            - AttributeName: userId
              KeyType: HASH
            - AttributeName: createdAt
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
      TimeToLiveSpecification:
        Enabled: true
        AttributeName: ttl
        
  # 6. IAM Role for Image Processor
  ImageProcessorRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
        - PolicyName: ImageProcessorPolicy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - s3:PutObject
                  - s3:PutObjectAcl
                  - s3:GetObject
                Resource: !Sub '${GeneratedImagesBucket.Arn}/*'
              - Effect: Allow
                Action:
                  - dynamodb:GetItem
                  - dynamodb:PutItem
                  - dynamodb:UpdateItem
                  - dynamodb:Query
                Resource:
                  - !GetAtt ImageEditSessionsTable.Arn
                  - !Sub '${ImageEditSessionsTable.Arn}/index/*'
              - Effect: Allow
                Action:
                  - lambda:InvokeFunction
                Resource: !GetAtt ImageProcessorFunction.Arn
```

---

## Building Lambda Layers

### ImageMagick Layer

**Build Script** (`scripts/build-imagemagick-layer.sh`):

```bash
#!/bin/bash
set -e

echo "Building ImageMagick Lambda Layer..."

# Create build directory
mkdir -p /tmp/imagemagick-build
cd /tmp/imagemagick-build

# Download ImageMagick source
wget https://imagemagick.org/archive/ImageMagick.tar.gz
tar xvzf ImageMagick.tar.gz
cd ImageMagick-*

# Configure with minimal dependencies
./configure \
  --prefix=/opt \
  --enable-shared=no \
  --enable-static=yes \
  --disable-docs \
  --without-magick-plus-plus \
  --without-perl \
  --without-x \
  --with-quantum-depth=8

# Build
make -j$(nproc)
make install DESTDIR=/tmp/layer

# Package layer
cd /tmp/layer
mkdir -p opt/bin
cp -r opt/bin/* opt/bin/
zip -r /tmp/imagemagick-layer.zip opt/

echo "✅ ImageMagick layer built: /tmp/imagemagick-layer.zip"
echo "   Size: $(du -h /tmp/imagemagick-layer.zip | cut -f1)"
```

**Upload Layer**:
```bash
aws lambda publish-layer-version \
  --layer-name imagemagick-7 \
  --description "ImageMagick 7.x for Amazon Linux 2" \
  --zip-file fileb:///tmp/imagemagick-layer.zip \
  --compatible-runtimes nodejs20.x nodejs18.x \
  --region us-east-1
```

### Sharp Layer

**Build Script** (`scripts/build-sharp-layer.sh`):

```bash
#!/bin/bash
set -e

echo "Building Sharp Lambda Layer..."

# Create layer directory
mkdir -p /tmp/sharp-layer/nodejs
cd /tmp/sharp-layer/nodejs

# Install sharp with lambda-compatible binaries
npm init -y
npm install sharp --arch=x64 --platform=linux --libc=glibc

# Remove unnecessary files
rm package-lock.json package.json
cd ..

# Package layer
zip -r /tmp/sharp-layer.zip nodejs/

echo "✅ Sharp layer built: /tmp/sharp-layer.zip"
echo "   Size: $(du -h /tmp/sharp-layer.zip | cut -f1)"
```

**Upload Layer**:
```bash
aws lambda publish-layer-version \
  --layer-name sharp \
  --description "Sharp image processing library" \
  --zip-file fileb:///tmp/sharp-layer.zip \
  --compatible-runtimes nodejs20.x \
  --region us-east-1
```

---

## Deployment Scripts

### Deploy Image Processor Lambda

**Makefile Target**:

```makefile
# Deploy image processor Lambda
deploy-image-processor:
	@echo "📦 Building image processor package..."
	@cd src/lambdas/imageProcessor && npm install --production
	@cd src/lambdas/imageProcessor && zip -r ../../../image-processor.zip .
	
	@echo "☁️  Uploading to S3..."
	@aws s3 cp image-processor.zip s3://lambda-deployment-bucket/
	
	@echo "🚀 Updating Lambda function..."
	@aws lambda update-function-code \
		--function-name lambdallmproxy-image-processor \
		--s3-bucket lambda-deployment-bucket \
		--s3-key image-processor.zip
		
	@echo "⏳ Waiting for function update..."
	@aws lambda wait function-updated \
		--function-name lambdallmproxy-image-processor
		
	@echo "✅ Image processor deployed successfully"
	
# Update function configuration
update-image-processor-config:
	@aws lambda update-function-configuration \
		--function-name lambdallmproxy-image-processor \
		--memory-size 2048 \
		--timeout 300 \
		--ephemeral-storage Size=2048 \
		--environment "Variables={S3_BUCKET=generated-images-bucket,DYNAMODB_TABLE=image-edit-sessions}"
		
# Build layers
build-layers:
	@bash scripts/build-imagemagick-layer.sh
	@bash scripts/build-sharp-layer.sh
	
# Upload layers
upload-layers:
	@aws lambda publish-layer-version \
		--layer-name imagemagick-7 \
		--zip-file fileb:///tmp/imagemagick-layer.zip \
		--compatible-runtimes nodejs20.x
	@aws lambda publish-layer-version \
		--layer-name sharp \
		--zip-file fileb:///tmp/sharp-layer.zip \
		--compatible-runtimes nodejs20.x
```

### Update Main Lambda with Image Editor Endpoints

**Deployment Steps**:

1. Add new endpoint handlers to `src/index.js`:
```javascript
// Import image edit endpoint
const { handleImageEdit, handleProgressStream } = require('./endpoints/imageEdit');

// Add routes
if (path === '/image-edit' && method === 'POST') {
  return await handleImageEdit(event, context);
}

if (path.startsWith('/image-edit/progress/') && method === 'GET') {
  return await handleProgressStream(event, context);
}
```

2. Deploy main Lambda:
```bash
make deploy-lambda-fast
```

---

## Environment Variables

### Main Lambda (Existing Function)

```bash
# Add to .env
IMAGE_PROCESSOR_FUNCTION_ARN=arn:aws:lambda:us-east-1:123456789:function:lambdallmproxy-image-processor
IMAGE_EDIT_SESSIONS_TABLE=image-edit-sessions
GENERATED_IMAGES_BUCKET=generated-images-bucket
```

Deploy environment variables:
```bash
make deploy-env
```

### Image Processor Lambda

Set via CloudFormation or AWS CLI:
```bash
aws lambda update-function-configuration \
  --function-name lambdallmproxy-image-processor \
  --environment "Variables={
    S3_BUCKET=generated-images-bucket,
    DYNAMODB_TABLE=image-edit-sessions,
    MAX_IMAGE_SIZE=26214400,
    MAX_DIMENSIONS=10000,
    DEFAULT_QUALITY=90
  }"
```

---

## Database Migration

### Create DynamoDB Table

**Using AWS CLI**:
```bash
aws dynamodb create-table \
  --table-name image-edit-sessions \
  --attribute-definitions \
    AttributeName=sessionId,AttributeType=S \
    AttributeName=userId,AttributeType=S \
    AttributeName=createdAt,AttributeType=N \
  --key-schema \
    AttributeName=sessionId,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=userId-createdAt-index,KeySchema=[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
  --billing-mode PAY_PER_REQUEST \
  --stream-specification StreamEnabled=false \
  --tags Key=Project,Value=lambdallmproxy Key=Component,Value=image-editor
  
# Enable TTL
aws dynamodb update-time-to-live \
  --table-name image-edit-sessions \
  --time-to-live-specification \
    "Enabled=true,AttributeName=ttl"
```

---

## S3 Bucket Setup

### Create Bucket

```bash
# Create bucket
aws s3 mb s3://generated-images-bucket --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket generated-images-bucket \
  --versioning-configuration Status=Enabled
  
# Configure lifecycle
cat > lifecycle.json <<EOF
{
  "Rules": [
    {
      "Id": "DeleteOldImages",
      "Status": "Enabled",
      "ExpirationInDays": 30,
      "Prefix": ""
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket generated-images-bucket \
  --lifecycle-configuration file://lifecycle.json
  
# Configure CORS
cat > cors.json <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF

aws s3api put-bucket-cors \
  --bucket generated-images-bucket \
  --cors-configuration file://cors.json
```

### Bucket Policy (Public Read)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::generated-images-bucket/*"
    }
  ]
}
```

Apply policy:
```bash
aws s3api put-bucket-policy \
  --bucket generated-images-bucket \
  --policy file://bucket-policy.json
```

---

## Monitoring & Logging

### CloudWatch Dashboards

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "title": "Image Processor Invocations",
        "metrics": [
          ["AWS/Lambda", "Invocations", {"stat": "Sum", "label": "Total Invocations"}],
          [".", "Errors", {"stat": "Sum", "label": "Errors"}],
          [".", "Throttles", {"stat": "Sum", "label": "Throttles"}]
        ],
        "period": 300,
        "region": "us-east-1",
        "yAxis": {"left": {"min": 0}}
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "Processing Duration",
        "metrics": [
          ["AWS/Lambda", "Duration", {"stat": "Average"}],
          ["...", {"stat": "p99"}]
        ],
        "period": 300,
        "region": "us-east-1"
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "Memory Usage",
        "metrics": [
          ["AWS/Lambda", "MaxMemoryUsed", {"stat": "Average"}]
        ],
        "period": 300,
        "region": "us-east-1"
      }
    }
  ]
}
```

### CloudWatch Alarms

```bash
# High error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name image-processor-high-errors \
  --alarm-description "Alert when error rate exceeds 5%" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=lambdallmproxy-image-processor
  
# Memory usage alarm
aws cloudwatch put-metric-alarm \
  --alarm-name image-processor-high-memory \
  --alarm-description "Alert when memory usage exceeds 1.8GB" \
  --metric-name MaxMemoryUsed \
  --namespace AWS/Lambda \
  --statistic Maximum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 1887436800 \
  --comparison-operator GreaterThanThreshold
  
# Timeout alarm
aws cloudwatch put-metric-alarm \
  --alarm-name image-processor-timeouts \
  --alarm-description "Alert on function timeouts" \
  --metric-name Duration \
  --namespace AWS/Lambda \
  --statistic Maximum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 295000 \
  --comparison-operator GreaterThanThreshold
```

---

## Testing

### Unit Tests

```bash
# Test image processor locally
cd src/lambdas/imageProcessor
npm test

# Run with coverage
npm run test:coverage
```

### Integration Tests

```bash
# Test with real AWS resources
AWS_PROFILE=dev npm run test:integration

# Load testing
artillery run tests/load/image-processing.yml
```

### Load Test Configuration (`tests/load/image-processing.yml`):

```yaml
config:
  target: "https://your-lambda-url.amazonaws.com"
  phases:
    - duration: 60
      arrivalRate: 5
      name: "Warm up"
    - duration: 300
      arrivalRate: 20
      name: "Sustained load"
  processor: "./processor.js"

scenarios:
  - name: "Process single image"
    flow:
      - post:
          url: "/image-edit"
          headers:
            Authorization: "Bearer {{authToken}}"
          json:
            images:
              - id: "{{$randomString()}}"
                url: "{{imageUrl}}"
                name: "test.jpg"
            operation:
              type: "command"
              command: "resize to 800px"
```

---

## Cost Estimation

### Monthly Costs (1000 images/day)

| Resource | Usage | Cost |
|----------|-------|------|
| Image Processor Lambda | 30,000 invocations × 10s @ 2GB | $16.67 |
| Main Lambda (orchestration) | 30,000 invocations × 1s @ 256MB | $0.83 |
| DynamoDB | 90,000 writes + 90,000 reads | $1.13 |
| S3 Storage | 100 GB average | $2.30 |
| S3 Requests | 30,000 PUTs + 60,000 GETs | $0.17 |
| Data Transfer | 50 GB outbound | $4.50 |
| **Total** | | **~$25.60/month** |

**Per-Image Cost**: ~$0.00085

---

## Rollback Plan

### Revert Lambda Code

```bash
# List previous versions
aws lambda list-versions-by-function \
  --function-name lambdallmproxy-image-processor
  
# Rollback to version
aws lambda update-alias \
  --function-name lambdallmproxy-image-processor \
  --name production \
  --function-version $PREVIOUS_VERSION
```

### Delete Resources

```bash
# Delete Lambda function
aws lambda delete-function \
  --function-name lambdallmproxy-image-processor
  
# Delete DynamoDB table
aws dynamodb delete-table \
  --table-name image-edit-sessions
  
# Empty and delete S3 bucket
aws s3 rm s3://generated-images-bucket --recursive
aws s3 rb s3://generated-images-bucket
```

---

## Next Steps

1. Review and approve CloudFormation template
2. Build Lambda layers
3. Deploy infrastructure
4. Test with sample images
5. Set up monitoring
6. Deploy to production
7. Monitor initial usage
8. Optimize based on metrics
