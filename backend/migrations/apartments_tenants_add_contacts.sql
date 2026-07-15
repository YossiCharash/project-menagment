-- Reception Desk (דלפק): parking/storage numbers, owner email + 2nd owner
-- contact, and a 2nd contact person on a tenant.
--
-- Rationale: apartments now carry a parking number (מספר חניה), a storage
-- number (מספר מחסן), an owner email, and a full second owner contact
-- (name/phone/email). Tenants gain a second contact person too. The live
-- schema was created via create_all (which never alters existing tables), so
-- these columns are added by hand. All are nullable, so existing rows are
-- unaffected. These same statements also run on startup from
-- backend/db/init_db.py (_ADDITIVE_MIGRATIONS), so this file is the manual
-- equivalent for out-of-band runs.

ALTER TABLE apartments ADD COLUMN IF NOT EXISTS parking_number VARCHAR(50);
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS storage_number VARCHAR(50);
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS owner_name_2 VARCHAR(255);
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS owner_phone_2 VARCHAR(50);
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS owner_email_2 VARCHAR(255);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS name_2 VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone_2 VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_2 VARCHAR(255);
