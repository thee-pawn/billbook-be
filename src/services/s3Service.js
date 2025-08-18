const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const config = require('../config/config');

// Configure AWS based on environment
let s3Options = {
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey,
  region: config.aws.region
};

// Use LocalStack in development mode
if (process.env.NODE_ENV === 'development') {
  s3Options = {
    accessKeyId: 'test', // LocalStack default credentials
    secretAccessKey: 'test', // LocalStack default credentials
    endpoint: process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566', // LocalStack default endpoint
    s3ForcePathStyle: true,
    signatureVersion: 'v4'
  };
  console.log('Using LocalStack S3 endpoint for development');
}

// Configure AWS with appropriate options
AWS.config.update(s3Options);

const s3 = new AWS.S3();

class S3Service {
  constructor() {
    this.bucketName = config.aws.s3BucketName;
    this.isLocalS3 = process.env.NODE_ENV === 'development';

    // Ensure bucket exists for local development
    if (this.isLocalS3) {
      this.ensureBucketExists();
    }
  }

  // Create bucket if it doesn't exist (for local development)
  async ensureBucketExists() {
    try {
      await s3.headBucket({ Bucket: this.bucketName }).promise();
      console.log(`Bucket ${this.bucketName} already exists`);
    } catch (error) {
      if (error.code === 'NotFound' || error.code === 'NoSuchBucket') {
        try {
          await s3.createBucket({ Bucket: this.bucketName }).promise();
          console.log(`Created bucket: ${this.bucketName}`);
        } catch (createError) {
          console.error(`Error creating bucket: ${createError.message}`);
        }
      } else {
        console.error(`Error checking bucket: ${error.message}`);
      }
    }
  }

  // Get the file URL based on environment
  getFileUrl(key) {
    if (this.isLocalS3) {
      const endpoint = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
      return `${endpoint}/${this.bucketName}/${key}`;
    }
    return `https://${this.bucketName}.s3.amazonaws.com/${key}`;
  }

  // Create multer upload middleware for S3
  createUploadMiddleware(options = {}) {
    const {
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
      maxFileSize = 5 * 1024 * 1024, // 5MB default
      filePrefix = 'uploads/'
    } = options;

    return multer({
      storage: multerS3({
        s3: s3,
        bucket: this.bucketName,
        acl: 'public-read',
        metadata: function (req, file, cb) {
          cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
          const fileName = `${filePrefix}${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
          cb(null, fileName);
        }
      }),
      fileFilter: (req, file, cb) => {
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`), false);
        }
      },
      limits: {
        fileSize: maxFileSize
      }
    });
  }

  // Upload file directly to S3
  async uploadFile(file, key, options = {}) {
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: file,
      ACL: options.acl || 'public-read',
      ContentType: options.contentType || 'application/octet-stream'
    };

    try {
      const result = await s3.upload(params).promise();
      return {
        success: true,
        url: this.isLocalS3 ? this.getFileUrl(key) : result.Location,
        key: result.Key,
        etag: result.ETag
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  // Delete file from S3
  async deleteFile(key) {
    const params = {
      Bucket: this.bucketName,
      Key: key
    };

    try {
      await s3.deleteObject(params).promise();
      return { success: true, message: 'File deleted successfully' };
    } catch (error) {
      console.error('S3 delete error:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  // Get signed URL for private files
  async getSignedUrl(key, expires = 3600) {
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Expires: expires
    };

    try {
      const url = await s3.getSignedUrlPromise('getObject', params);
      return { success: true, url };
    } catch (error) {
      console.error('S3 signed URL error:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  // List files in bucket
  async listFiles(prefix = '', maxKeys = 1000) {
    const params = {
      Bucket: this.bucketName,
      Prefix: prefix,
      MaxKeys: maxKeys
    };

    try {
      const result = await s3.listObjectsV2(params).promise();
      return {
        success: true,
        files: result.Contents.map(file => ({
          key: file.Key,
          lastModified: file.LastModified,
          size: file.Size,
          url: this.isLocalS3 ? this.getFileUrl(file.Key) : `https://${this.bucketName}.s3.${config.aws.region}.amazonaws.com/${file.Key}`
        })),
        count: result.KeyCount
      };
    } catch (error) {
      console.error('S3 list files error:', error);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  // Check if bucket exists and is accessible
  async testConnection() {
    try {
      await s3.headBucket({ Bucket: this.bucketName }).promise();
      console.log(`S3 bucket "${this.bucketName}" is accessible`);
      return true;
    } catch (error) {
      console.error('S3 connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = new S3Service();
