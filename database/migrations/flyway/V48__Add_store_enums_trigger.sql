-- Create function to initialize default enums for a new store
CREATE OR REPLACE FUNCTION initialize_store_enums()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert default enum types with empty values for the new store
    INSERT INTO enums (store_id, type, values) VALUES
        (NEW.id, 'serviceCategory', '{}'),
        (NEW.id, 'productCategory', '{}'),
        (NEW.id, 'roles', '{}');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically initialize enums when a store is created
CREATE TRIGGER trigger_initialize_store_enums
    AFTER INSERT ON stores
    FOR EACH ROW
    EXECUTE FUNCTION initialize_store_enums();
