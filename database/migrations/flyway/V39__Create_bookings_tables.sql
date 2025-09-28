-- Create bookings and booking_items tables

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NULL REFERENCES customers(id) ON DELETE SET NULL,
  country_code VARCHAR(10) NOT NULL,
  contact_no VARCHAR(20) NOT NULL,
  phone_number VARCHAR(30) NOT NULL,
  customer_name VARCHAR(150) NOT NULL,
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('male','female','other')),
  email VARCHAR(255),
  address TEXT,
  booking_datetime TIMESTAMPTZ NOT NULL,
  venue_type VARCHAR(10) NOT NULL CHECK (venue_type IN ('indoor','outdoor')),
  remarks TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in-progress','completed','cancelled')),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  advance_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_mode VARCHAR(10) NOT NULL CHECK (payment_mode IN ('cash','card','online')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_contact_no_digits_bk CHECK (contact_no ~ '^[0-9]{10}$'),
  CONSTRAINT chk_country_code_format_bk CHECK (country_code ~ '^\+[0-9]+$')
);

CREATE INDEX IF NOT EXISTS idx_bookings_store_id ON bookings(store_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_datetime ON bookings(booking_datetime);
CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at ON bookings(deleted_at);
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone_number);

CREATE TABLE IF NOT EXISTS booking_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  service_name VARCHAR(255) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  staff_id UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
  staff_name VARCHAR(255),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  scheduled_at TIMESTAMPTZ NULL,
  venue VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_booking_items_booking_id ON booking_items(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_items_service_id ON booking_items(service_id);
CREATE INDEX IF NOT EXISTS idx_booking_items_staff_id ON booking_items(staff_id);
