const database = require('../config/database');

/**
 * Update the status of an appointment.
 *
 * If a `client` (pg client) is provided, it will be used (useful inside transactions).
 * Otherwise the shared `database` instance will be used.
 *
 * @param {object} client - optional pg client or database-like object with `query` method
 * @param {string} appointmentId - UUID of the appointment
 * @param {string} status - New status to set
 * @param {string} updatedBy - User id who updated the status (optional)
 * @returns {object|null} - Updated appointment row or null if not found
 */
async function updateAppointmentStatus(client, appointmentId, status, updatedBy = null) {
	if (!appointmentId) {
		throw new Error('appointmentId is required');
	}
	if (!status) {
		throw new Error('status is required');
	}

	const db = client && typeof client.query === 'function' ? client : database;

	const { rows } = await db.query(
		`UPDATE appointments SET status = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3 RETURNING *`,
		[status, updatedBy, appointmentId]
	);

	return rows && rows.length ? rows[0] : null;
}

module.exports = {
	updateAppointmentStatus
};
