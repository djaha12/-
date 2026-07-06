-- AlterTable
ALTER TABLE "ChatThread" ADD COLUMN     "aboutCaseId" TEXT,
ADD COLUMN     "subject" TEXT;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_aboutCaseId_fkey" FOREIGN KEY ("aboutCaseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
