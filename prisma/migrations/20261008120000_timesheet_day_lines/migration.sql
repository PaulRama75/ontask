-- A day can now be split across job numbers: several lines per date.
-- Existing rows become line 0 of their day.
ALTER TABLE "TimesheetDay" ADD COLUMN IF NOT EXISTS "line" INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "TimesheetDay_timesheetId_date_key";

CREATE UNIQUE INDEX IF NOT EXISTS "TimesheetDay_timesheetId_date_line_key" ON "TimesheetDay"("timesheetId", "date", "line");
