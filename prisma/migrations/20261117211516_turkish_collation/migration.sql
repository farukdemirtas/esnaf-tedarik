-- Türkçe alfabetik sıralama (Ç, Ğ, İ, Ö, Ş, Ü doğru yerde).
-- Veritabanının yerel ayarından bağımsız çalışması için ad alanlarına ICU Türkçe sıralama kuralı atanır.
-- Prisma şemasında sıralama kuralı modellenmediği için bu migration elle yazılmıştır.

ALTER TABLE "District"  ALTER COLUMN "name"         TYPE TEXT COLLATE "tr-x-icu";
ALTER TABLE "Member"    ALTER COLUMN "businessName" TYPE TEXT COLLATE "tr-x-icu";
ALTER TABLE "Member"    ALTER COLUMN "ownerName"    TYPE TEXT COLLATE "tr-x-icu";
ALTER TABLE "Supplier"  ALTER COLUMN "tradeName"    TYPE TEXT COLLATE "tr-x-icu";
ALTER TABLE "Supplier"  ALTER COLUMN "legalName"    TYPE TEXT COLLATE "tr-x-icu";
ALTER TABLE "Product"   ALTER COLUMN "name"         TYPE TEXT COLLATE "tr-x-icu";
ALTER TABLE "Brand"     ALTER COLUMN "name"         TYPE TEXT COLLATE "tr-x-icu";
ALTER TABLE "Category"  ALTER COLUMN "name"         TYPE TEXT COLLATE "tr-x-icu";
ALTER TABLE "User"      ALTER COLUMN "fullName"     TYPE TEXT COLLATE "tr-x-icu";
ALTER TABLE "Campaign"  ALTER COLUMN "title"        TYPE TEXT COLLATE "tr-x-icu";
