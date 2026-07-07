-- Очистка смоук-артефактов (тестовые номера +9967000880xx)
BEGIN;
CREATE TEMP TABLE smoke_users AS SELECT id FROM "User" WHERE phone LIKE '+9967000880%';
-- уведомления и тарифы (M6); использованные тест-прогонами промо-активации
-- возвращаем коду (redeemedCount), чтобы дев-код не истощался
UPDATE "PromoCode" pc SET "redeemedCount" = GREATEST(0, pc."redeemedCount" - sub.n)
FROM (SELECT "promoCodeId", count(*) n FROM "Entitlement"
      WHERE "userId" IN (SELECT id FROM smoke_users) AND "promoCodeId" IS NOT NULL
      GROUP BY "promoCodeId") sub
WHERE pc.id = sub."promoCodeId";
DELETE FROM "Entitlement" WHERE "userId" IN (SELECT id FROM smoke_users);
DELETE FROM "Notification" WHERE "userId" IN (SELECT id FROM smoke_users);
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
-- аналитика (M8): события тест-юзеров + гостевые маркеры смоука (actorId у гостя NULL)
DELETE FROM "AnalyticsOutbox" WHERE "actorId" IN (SELECT id FROM smoke_users)
   OR props->>'slug' LIKE 'guest-%' OR props->>'slug' LIKE 'burst-%';
-- OtpCode: смоук-номера (+9967000880xx) И сид-номера, в которые смоуки логинятся
-- (+99670000xx модератор/спец/клиент, +99670001xx клиент) — иначе за прогон
-- копится > OTP_MAX_PER_HOUR и логин начинает падать
DELETE FROM "OtpCode"
 WHERE phone LIKE '+9967000880%' OR phone LIKE '+99670000%' OR phone LIKE '+99670001%';
DELETE FROM "User" WHERE id IN (SELECT id FROM smoke_users);
COMMIT;
SELECT count(*) AS leftover FROM "User" WHERE phone LIKE '+9967000880%';
