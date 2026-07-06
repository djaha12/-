-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "confirmedOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Case_confirmedOrderId_key" ON "Case"("confirmedOrderId");


-- Один активный заказ на тред: закрывает гонку двойного propose (code-review M4 №3)
CREATE UNIQUE INDEX "order_one_active_per_thread"
  ON "Order"("threadId")
  WHERE "state" NOT IN ('COMPLETED','CANCELLED') AND "threadId" IS NOT NULL;
