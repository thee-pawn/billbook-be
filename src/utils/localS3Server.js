const S3rver = require('s3rver');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class LocalS3Server {
  constructor() {
    this.instance = null;
    this.isRunning = false;
    this.config = config.localS3;
  }

  async start() {
    if (this.isRunning) {
      console.log('Local S3 server is already running');
      return;
    }

    // Create the local S3 storage directory if it doesn't exist
    if (!fs.existsSync(this.config.directory)) {
      fs.mkdirSync(this.config.directory, { recursive: true });
      console.log(`Created local S3 directory at ${this.config.directory}`);
    }

    try {
      this.instance = new S3rver({
        port: this.config.port,
        address: '0.0.0.0',
        directory: this.config.directory,
        silent: false, // Set to true in production
        configureBuckets: this.config.createBucketOnStart ? [{
          name: config.aws.s3BucketName,
          configs: []
        }] : []
      });

      await this.instance.run();
      this.isRunning = true;
      console.log(`Local S3 server started on port ${this.config.port}`);
      console.log(`S3 Endpoint: ${this.config.endpointUrl}`);
      console.log(`Initial bucket created: ${config.aws.s3BucketName}`);
    } catch (err) {
      console.error('Failed to start local S3 server:', err);
      throw err;
    }
  }

  async stop() {
    if (this.isRunning && this.instance) {
      await this.instance.close();
      this.isRunning = false;
      console.log('Local S3 server stopped');
    }
  }

  getEndpointUrl() {
    return this.config.endpointUrl;
  }
}

module.exports = new LocalS3Server();
