const express = require('express');
const router = express.Router();
const s3Service = require('../services/s3Service');
const { authenticateToken } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');

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
