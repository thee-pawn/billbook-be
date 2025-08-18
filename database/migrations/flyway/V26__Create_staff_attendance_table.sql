-- Flyway Migration: V26__Create_staff_attendance_table.sql
-- Description: Create staff attendance table for tracking punch in/out and leave management
-- Author: Billbook Backend Team
-- Created: 2025-08-10

CREATE TABLE IF NOT EXISTS staff_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'absent', -- present, half_day, leave, leave_requested, leave_approved, absent
    punch_in_time TIME, -- 24-hour format HH:MM:SS
    punch_out_time TIME, -- 24-hour format HH:MM:SS
    leave_type VARCHAR(100), -- sick_leave, casual_leave, personal_leave, etc.
    leave_reason TEXT,
    approved_by UUID REFERENCES staff(id), -- Staff ID of approver
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(staff_id, date), -- One record per staff per day
    CHECK (punch_out_time IS NULL OR punch_in_time IS NOT NULL), -- Can't punch out without punch in
    CHECK (punch_out_time IS NULL OR punch_out_time > punch_in_time), -- Punch out must be after punch in
    CHECK (status IN ('present', 'half_day', 'leave', 'leave_requested', 'leave_approved', 'absent'))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_id ON staff_attendance(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_status ON staff_attendance(status);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_date ON staff_attendance(staff_id, date);

-- Add comments for documentation
COMMENT ON TABLE staff_attendance IS 'Track staff attendance, punch in/out times, and leave management';
COMMENT ON COLUMN staff_attendance.status IS 'Attendance status: present, half_day, leave, leave_requested, leave_approved, absent';
COMMENT ON COLUMN staff_attendance.punch_in_time IS 'Time when staff punched in (24-hour format)';
COMMENT ON COLUMN staff_attendance.punch_out_time IS 'Time when staff punched out (24-hour format)';
COMMENT ON COLUMN staff_attendance.leave_type IS 'Type of leave: sick_leave, casual_leave, personal_leave, etc.';
