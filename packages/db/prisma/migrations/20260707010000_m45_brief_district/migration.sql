-- AlterTable
ALTER TABLE "Brief" ADD COLUMN     "districtId" TEXT;

-- AddForeignKey
ALTER TABLE "Brief" ADD CONSTRAINT "Brief_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

