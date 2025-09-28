-- V35 Create appointments and appointment_services tables

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    phone_number VARCHAR(20) NOT NULL,
    customer_name VARCHAR(150) NOT NULL DEFAULT '',
    gender VARCHAR(20),
    source VARCHAR(50),
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    total_duration_minutes INT NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    advance_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payable_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_mode VARCHAR(30),
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_store_date ON appointments(store_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_store_status ON appointments(store_id, status);

CREATE TABLE IF NOT EXISTS appointment_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_services_appt ON appointment_services(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_services_service ON appointment_services(service_id);
