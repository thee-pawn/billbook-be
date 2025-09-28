-- V34: Create junction table to associate staff with services
CREATE TABLE staff_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Prevent duplicate mappings
CREATE UNIQUE INDEX idx_staff_services_unique ON staff_services(staff_id, service_id);
CREATE INDEX idx_staff_services_staff_id ON staff_services(staff_id);
CREATE INDEX idx_staff_services_service_id ON staff_services(service_id);
CREATE INDEX idx_staff_services_store_id ON staff_services(store_id);

COMMENT ON TABLE staff_services IS 'Junction table mapping staff members to services they can perform';
COMMENT ON COLUMN staff_services.staff_id IS 'Reference to staff member';
COMMENT ON COLUMN staff_services.service_id IS 'Reference to service';
COMMENT ON COLUMN staff_services.store_id IS 'Store reference for faster lookups';
