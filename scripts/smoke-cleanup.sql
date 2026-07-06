-- Очистка смоук-артефактов (тестовые номера +9967000880xx)
BEGIN;
CREATE TEMP TABLE smoke_users AS SELECT id FROM "User" WHERE phone LIKE '+9967000880%';
-- модерация и жалобы (M5)
DELETE FROM "Report" WHERE "reporterId" IN (SELECT id FROM smoke_users)
   OR "targetId" IN (SELECT id FROM "Case" WHERE "authorId" IN (SELECT id FROM smoke_users))
   OR id LIKE 'smoke-%';
DELETE FROM "ModerationItem" WHERE "entityId" IN (SELECT id FROM "Case" WHERE "authorId" IN (SELECT id FROM smoke_users));
DELETE FROM "UserStrike" WHERE "userId" IN (SELECT id FROM smoke_users) OR id LIKE 'smoke-%';
DELETE FROM "AuditLog" WHERE "entityId" IN (SELECT id FROM "Case" WHERE "authorId" IN (SELECT id FROM smoke_users))
   OR "entityId" IN (SELECT id FROM smoke_users);
-- брифы и отклики (BriefResponseCase ссылается на Case — чистим до кейсов)
DELETE FROM "BriefResponseCase" WHERE "briefResponseId" IN (
  SELECT id FROM "BriefResponse" WHERE "specialistId" IN (SELECT id FROM smoke_users)
     OR "briefId" IN (SELECT id FROM "Brief" WHERE "clientId" IN (SELECT id FROM smoke_users)));
DELETE FROM "BriefResponse" WHERE "specialistId" IN (SELECT id FROM smoke_users)
   OR "briefId" IN (SELECT id FROM "Brief" WHERE "clientId" IN (SELECT id FROM smoke_users));
UPDATE "ChatThread" SET "briefId" = NULL WHERE "briefId" IN (SELECT id FROM "Brief" WHERE "clientId" IN (SELECT id FROM smoke_users));
DELETE FROM "Brief" WHERE "clientId" IN (SELECT id FROM smoke_users);
-- заказы/отзывы/кейсы/чаты/профили
UPDATE "Case" SET "coverImageId" = NULL WHERE "authorId" IN (SELECT id FROM smoke_users);
DELETE FROM "CaseImage" WHERE "caseId" IN (SELECT id FROM "Case" WHERE "authorId" IN (SELECT id FROM smoke_users));
DELETE FROM "Review" WHERE "authorId" IN (SELECT id FROM smoke_users) OR "specialistId" IN (SELECT id FROM smoke_users);
DELETE FROM "OrderEvent" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "clientId" IN (SELECT id FROM smoke_users) OR "specialistId" IN (SELECT id FROM smoke_users));
DELETE FROM "Order" WHERE "clientId" IN (SELECT id FROM smoke_users) OR "specialistId" IN (SELECT id FROM smoke_users);
DELETE FROM "Save" WHERE "userId" IN (SELECT id FROM smoke_users) OR "caseId" IN (SELECT id FROM "Case" WHERE "authorId" IN (SELECT id FROM smoke_users));
DELETE FROM "Case" WHERE "authorId" IN (SELECT id FROM smoke_users);
DELETE FROM "Message" WHERE "senderId" IN (SELECT id FROM smoke_users);
DELETE FROM "ChatParticipant" WHERE "userId" IN (SELECT id FROM smoke_users);
DELETE FROM "ChatThread" WHERE id NOT IN (SELECT DISTINCT "threadId" FROM "ChatParticipant");
DELETE FROM "ReviewAggregate" WHERE "specialistProfileId" IN (SELECT id FROM "SpecialistProfile" WHERE "userId" IN (SELECT id FROM smoke_users));
DELETE FROM "SpecialistDistrict" WHERE "specialistProfileId" IN (SELECT id FROM "SpecialistProfile" WHERE "userId" IN (SELECT id FROM smoke_users));
DELETE FROM "SpecialistProfile" WHERE "userId" IN (SELECT id FROM smoke_users);
DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM smoke_users);
DELETE FROM "OtpCode" WHERE phone LIKE '+9967000880%';
DELETE FROM "User" WHERE id IN (SELECT id FROM smoke_users);
COMMIT;
SELECT count(*) AS leftover FROM "User" WHERE phone LIKE '+9967000880%';
