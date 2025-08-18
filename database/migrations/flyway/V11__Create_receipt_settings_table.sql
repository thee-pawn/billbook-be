-- Create receipt_settings table
-- Migration: V11__Create_receipt_settings_table.sql

CREATE TABLE receipt_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,
    logo BOOLEAN NOT NULL DEFAULT false,
    gst_no BOOLEAN NOT NULL DEFAULT false,
    staff_name BOOLEAN NOT NULL DEFAULT false,
    loyalty_points BOOLEAN NOT NULL DEFAULT false,
    wallet_balance BOOLEAN NOT NULL DEFAULT false,
    payment_method BOOLEAN NOT NULL DEFAULT false,
    date_time BOOLEAN NOT NULL DEFAULT false,
    customer_contact BOOLEAN NOT NULL DEFAULT false,
    discount BOOLEAN NOT NULL DEFAULT false,
    notes JSONB,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Create index on store_id for better query performance
CREATE INDEX idx_receipt_settings_store_id ON receipt_settings(store_id);

-- Add comment to explain the table purpose
COMMENT ON TABLE receipt_settings IS 'Configuration settings for receipt customization per store';
COMMENT ON COLUMN receipt_settings.logo IS 'Whether to show store logo on receipt';
COMMENT ON COLUMN receipt_settings.gst_no IS 'Whether to show GST number on receipt';
COMMENT ON COLUMN receipt_settings.staff_name IS 'Whether to show staff name on receipt';
COMMENT ON COLUMN receipt_settings.loyalty_points IS 'Whether to show loyalty points on receipt';
COMMENT ON COLUMN receipt_settings.wallet_balance IS 'Whether to show wallet balance on receipt';
COMMENT ON COLUMN receipt_settings.payment_method IS 'Whether to show payment method on receipt';
COMMENT ON COLUMN receipt_settings.date_time IS 'Whether to show date and time on receipt';
COMMENT ON COLUMN receipt_settings.customer_contact IS 'Whether to show customer contact info on receipt';
COMMENT ON COLUMN receipt_settings.discount IS 'Whether to show discount details on receipt';
COMMENT ON COLUMN receipt_settings.notes IS 'Additional receipt customization settings in JSON format';
