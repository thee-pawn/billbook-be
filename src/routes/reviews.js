const express = require('express');
const router = express.Router();
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { generalLimiter } = require('../middleware/rateLimiter');
const database = require('../config/database');

// Helper function to calculate average ratings
function calculateAverageRating(staffRating, hospitalityRating, serviceRating) {
  return ((staffRating + hospitalityRating + serviceRating) / 3).toFixed(1);
}

// Helper function to build review response
function buildReviewResponse(review) {
  return {
    id: review.id,
    storeId: review.store_id,
    referringId: review.referring_id,
    ratings: {
      staff: review.staff_rating,
      hospitality: review.hospitality_rating,
      service: review.service_rating,
      average: calculateAverageRating(
        review.staff_rating,
        review.hospitality_rating,
        review.service_rating
      )
    },
    review: review.review,
    status: review.status,
    createdAt: review.created_at,
    updatedAt: review.updated_at,
      name: review.name
  };
}

// Get all reviews for a store (PUBLIC - with rate limiting)
router.get('/store/:storeId', generalLimiter, validateQuery(schemas.reviewQuery), async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const {
      page = 1,
      limit = 10,
      status = 'active',
      minRating,
      maxRating,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    // Check if store exists
    const storeResult = await database.query(
      'SELECT id FROM stores WHERE id = $1',
      [storeId]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Store not found'
      });
    }

    // Build the base query
    let baseQuery = 'FROM reviews WHERE store_id = $1';
    let queryParams = [storeId];
    let paramCount = 2;

    // Add status filter
    if (status) {
      baseQuery += ` AND status = $${paramCount}`;
      queryParams.push(status);
      paramCount++;
    }

    // Add rating filters
    if (minRating !== undefined) {
      baseQuery += ` AND (staff_rating >= $${paramCount} OR hospitality_rating >= $${paramCount} OR service_rating >= $${paramCount})`;
      queryParams.push(minRating);
      paramCount++;
    }

    if (maxRating !== undefined) {
      baseQuery += ` AND (staff_rating <= $${paramCount} AND hospitality_rating <= $${paramCount} AND service_rating <= $${paramCount})`;
      queryParams.push(maxRating);
      paramCount++;
    }

    // Get total count
    const countResult = await database.query(`SELECT COUNT(*) ${baseQuery}`, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Build the main query with sorting and pagination
    const offset = (page - 1) * limit;
    const validSortColumns = ['created_at', 'staff_rating', 'hospitality_rating', 'service_rating'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const reviewsQuery = `
      SELECT * ${baseQuery}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    queryParams.push(limit, offset);

    const result = await database.query(reviewsQuery, queryParams);

    // Build response data
    const reviews = result.rows.map(review => buildReviewResponse(review));

    // Calculate store statistics
    const statsResult = await database.query(`
      SELECT 
        COUNT(*) as total_reviews,
        AVG(staff_rating) as avg_staff_rating,
        AVG(hospitality_rating) as avg_hospitality_rating,
        AVG(service_rating) as avg_service_rating,
        AVG((staff_rating + hospitality_rating + service_rating) / 3.0) as overall_average
      FROM reviews 
      WHERE store_id = $1 AND status = 'active'
    `, [storeId]);

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      message: 'Reviews retrieved successfully',
      data: {
        reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        statistics: {
          totalReviews: parseInt(stats.total_reviews) || 0,
          averageRatings: {
            staff: parseFloat(stats.avg_staff_rating || 0).toFixed(1),
            hospitality: parseFloat(stats.avg_hospitality_rating || 0).toFixed(1),
            service: parseFloat(stats.avg_service_rating || 0).toFixed(1),
            overall: parseFloat(stats.overall_average || 0).toFixed(1)
          }
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create a new review (PUBLIC - with rate limiting)
router.post('/', generalLimiter, validate(schemas.createReview), async (req, res, next) => {
  try {
    const {
      storeId,
      referringId,
      staffRating,
      hospitalityRating,
      serviceRating,
      review = '',
        name,
    } = req.body;

    // Check if store exists
    const storeResult = await database.query(
      'SELECT id FROM stores WHERE id = $1',
      [storeId]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Store not found'
      });
    }

    // Check if review already exists for this referring ID and store
    const existingReview = await database.query(
      'SELECT id FROM reviews WHERE store_id = $1 AND referring_id = $2',
      [storeId, referringId]
    );

    if (existingReview.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Review already submitted for this referring ID. You can only submit one review per store.'
      });
    }

    // Create the review
    const result = await database.query(
      `INSERT INTO reviews (
        store_id, referring_id, staff_rating, hospitality_rating, 
        service_rating, review, status, created_at, updated_at, name
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 'active', NOW(), NOW(), $7
      ) RETURNING *`,
      [storeId, referringId, staffRating, hospitalityRating, serviceRating, review, name]
    );

    const createdReview = result.rows[0];
    const reviewData = buildReviewResponse(createdReview);

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        review: reviewData
      }
    });
  } catch (error) {
    if (error.code === '23505') {
      // Unique constraint violation (duplicate referring_id for same store)
      return res.status(409).json({
        success: false,
        message: 'Review already submitted for this referring ID. You can only submit one review per store.'
      });
    }
    next(error);
  }
});

// Get review statistics for a store (PUBLIC - with rate limiting)
router.get('/store/:storeId/statistics', generalLimiter, async (req, res, next) => {
  try {
    const { storeId } = req.params;

    // Check if store exists
    const storeResult = await database.query(
      'SELECT id FROM stores WHERE id = $1',
      [storeId]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Store not found'
      });
    }

    // Get statistics with star distribution based on overall rating
    const statsResult = await database.query(`
      SELECT 
        COUNT(CASE WHEN status = 'active' THEN 1 END) as total_reviews,
        AVG(CASE WHEN status = 'active' THEN (staff_rating + hospitality_rating + service_rating) / 3.0 END) as overall_rating,
        COUNT(CASE WHEN status = 'active' AND (staff_rating + hospitality_rating + service_rating) / 3.0 > 4.5 THEN 1 END) as five_stars,
        COUNT(CASE WHEN status = 'active' AND (staff_rating + hospitality_rating + service_rating) / 3.0 > 3.5 AND (staff_rating + hospitality_rating + service_rating) / 3.0 <= 4.5 THEN 1 END) as four_stars,
        COUNT(CASE WHEN status = 'active' AND (staff_rating + hospitality_rating + service_rating) / 3.0 > 2.5 AND (staff_rating + hospitality_rating + service_rating) / 3.0 <= 3.5 THEN 1 END) as three_stars,
        COUNT(CASE WHEN status = 'active' AND (staff_rating + hospitality_rating + service_rating) / 3.0 > 1.5 AND (staff_rating + hospitality_rating + service_rating) / 3.0 <= 2.5 THEN 1 END) as two_stars,
        COUNT(CASE WHEN status = 'active' AND (staff_rating + hospitality_rating + service_rating) / 3.0 > 0 AND (staff_rating + hospitality_rating + service_rating) / 3.0 <= 1.5 THEN 1 END) as one_stars
      FROM reviews 
      WHERE store_id = $1
    `, [storeId]);

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      message: 'Review statistics retrieved successfully',
      data: {
        store_id: storeId,
        overall_rating: parseFloat(stats.overall_rating || 0).toFixed(1),
        total_reviews: parseInt(stats.total_reviews) || 0,
        five_stars: parseInt(stats.five_stars) || 0,
        four_stars: parseInt(stats.four_stars) || 0,
        three_stars: parseInt(stats.three_stars) || 0,
        two_stars: parseInt(stats.two_stars) || 0,
        one_stars: parseInt(stats.one_stars) || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
