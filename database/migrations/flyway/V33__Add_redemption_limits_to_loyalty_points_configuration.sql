-- V33: Add redemption limit fields to loyalty_points_configuration
ALTER TABLE loyalty_points_configuration
    ADD COLUMN min_service_redemption INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN max_service_redemption INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN min_products_redemption INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN max_products_redemption INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN min_membership_redemption INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN max_membership_redemption INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN loyalty_points_configuration.min_service_redemption IS 'Minimum points redeemable against services per transaction';
COMMENT ON COLUMN loyalty_points_configuration.max_service_redemption IS 'Maximum points redeemable against services per transaction (0 = no cap)';
COMMENT ON COLUMN loyalty_points_configuration.min_products_redemption IS 'Minimum points redeemable against products per transaction';
COMMENT ON COLUMN loyalty_points_configuration.max_products_redemption IS 'Maximum points redeemable against products per transaction (0 = no cap)';
COMMENT ON COLUMN loyalty_points_configuration.min_membership_redemption IS 'Minimum points redeemable against memberships per transaction';
COMMENT ON COLUMN loyalty_points_configuration.max_membership_redemption IS 'Maximum points redeemable against memberships per transaction (0 = no cap)';
