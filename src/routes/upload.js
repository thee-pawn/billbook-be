const express = require('express');
const router = express.Router();
const s3Service = require('../services/s3Service');
const { authenticateToken } = require('../middleware/auth');
const { uploadLimiter, generalLimiter } = require('../middleware/rateLimiter');

// Single file upload
router.post('/single', authenticateToken, uploadLimiter, (req, res, next) => {
  // Get path from query parameter or body, default to 'uploads/' if not provided
  const customPath = (req.query.path || req.body.path || 'uploads').replace(/\/$/, '') + '/';

  const upload = s3Service.createUploadMiddleware({
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    filePrefix: customPath
  });

  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        filename: req.file.key,
        url: req.file.location,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: customPath
      }
    });
  });
});

// Multiple files upload
router.post('/multiple', authenticateToken, uploadLimiter, (req, res, next) => {
  // Get path from query parameter or body, default to 'uploads/' if not provided
  const customPath = (req.query.path || req.body.path || 'uploads').replace(/\/$/, '') + '/';

  const upload = s3Service.createUploadMiddleware({
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    filePrefix: customPath
  });

  upload.array('files', 5)(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const files = req.files.map(file => ({
      filename: file.key,
      url: file.location,
      size: file.size,
      mimetype: file.mimetype
    }));

    res.json({
      success: true,
      message: 'Files uploaded successfully',
      data: {
        files,
        count: files.length
      }
    });
  });
});

// Delete file
router.delete('/:key', authenticateToken, async (req, res, next) => {
  try {
    const { key } = req.params;
    
    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'File key is required'
      });
    }

    await s3Service.deleteFile(key);

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Get signed URL for private files
router.get('/signed-url/:key', authenticateToken, async (req, res, next) => {
  try {
    const { key } = req.params;
    const { expires } = req.query;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'File key is required'
      });
    }

    const result = await s3Service.getSignedUrl(key, expires ? parseInt(expires) : 3600);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// List files
router.get('/list', authenticateToken, async (req, res, next) => {
  try {
    const { prefix, maxKeys } = req.query;

    const result = await s3Service.listFiles(
      prefix || '',
      maxKeys ? parseInt(maxKeys) : 1000
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

// Get file by key (streams from S3)
router.get('/file/*', authenticateToken, generalLimiter, async (req, res, next) => {
  try {
    const key = req.params[0]; // supports nested keys with slashes

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'File key is required'
      });
    }

    // Set basic headers; attempt simple mime inference by extension
    const lower = key.toLowerCase();
    let contentType = 'application/octet-stream';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (lower.endsWith('.png')) contentType = 'image/png';
    else if (lower.endsWith('.gif')) contentType = 'image/gif';
    else if (lower.endsWith('.pdf')) contentType = 'application/pdf';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${key.split('/').pop()}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');

    const stream = s3Service.getFileStream(key);
    stream.on('error', (err) => {
      if (err && (err.code === 'NoSuchKey' || err.code === 'NotFound')) {
        // Ensure no partial data was sent before writing JSON
        if (!res.headersSent) {
          return res.status(404).json({
            success: false,
            message: 'File not found'
          });
        }
        // If headers have been sent, just end the response
        try { res.end(); } catch (_) {}
        return;
      }
      next(err);
    });

    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});
