-- M11: дайджест — отметка последней отправки на пользователе
ALTER TABLE "User" ADD COLUMN "lastDigestAt" TIMESTAMP(3);
