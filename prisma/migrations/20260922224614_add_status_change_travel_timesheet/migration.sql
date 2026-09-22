-- CreateTable
CREATE TABLE "StatusChangeRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "reasonForChange" TEXT,
    "employmentType" TEXT,
    "fromJobNumber" TEXT,
    "toJobNumber" TEXT,
    "newSite" TEXT,
    "detailsOfChange" TEXT,
    "drivingRecordRequired" BOOLEAN,
    "creditCardRequested" BOOLEAN,
    "creditCardApprovedByGm" BOOLEAN,
    "deactivateEmailAccess" BOOLEAN,
    "deactivateAmexCard" BOOLEAN,
    "requestingManagerName" TEXT,
    "submittedByUserId" TEXT NOT NULL,
    "submittedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "jobNumber" TEXT,
    "clientName" TEXT,
    "fullName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "knownTravelerNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "flightNeeded" BOOLEAN,
    "travelType" TEXT,
    "dateOfDeparture" TIMESTAMP(3),
    "dateOfReturn" TIMESTAMP(3),
    "departureLocation" TEXT,
    "destinationLocation" TEXT,
    "seatPreference" TEXT,
    "timePreference" TEXT,
    "rentalCarNeeded" BOOLEAN,
    "rentalCarType" TEXT,
    "rentalCarJustification" TEXT,
    "pickupLocation" TEXT,
    "dropoffLocation" TEXT,
    "dateOfPickup" TIMESTAMP(3),
    "dateOfCarReturn" TIMESTAMP(3),
    "billingManagerEmail" TEXT,
    "additionalComments" TEXT,
    "submittedByUserId" TEXT NOT NULL,
    "submittedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTimesheetToken" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeTimesheetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timesheet" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekEnding" TIMESTAMP(3) NOT NULL,
    "clientName" TEXT,
    "location" TEXT,
    "jobNumber" TEXT,
    "notes" TEXT,
    "advancedToEmployee" DOUBLE PRECISION,
    "clientApprovalName" TEXT,
    "clientApprovedAt" TIMESTAMP(3),
    "employeeSignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetDay" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "jobNumber" TEXT,
    "afeNumber" TEXT,
    "woNumber" TEXT,
    "details" TEXT,
    "stHours" DOUBLE PRECISION,
    "otHours" DOUBLE PRECISION,
    "ptoHours" DOUBLE PRECISION,
    "vacationHours" DOUBLE PRECISION,
    "holidayHours" DOUBLE PRECISION,
    "perDiem" DOUBLE PRECISION,
    "mileageDriven" DOUBLE PRECISION,
    "mileageAmount" DOUBLE PRECISION,
    "lodging" DOUBLE PRECISION,
    "meals" DOUBLE PRECISION,
    "airfare" DOUBLE PRECISION,
    "fuel" DOUBLE PRECISION,
    "carRental" DOUBLE PRECISION,
    "gasoline" DOUBLE PRECISION,
    "parking" DOUBLE PRECISION,
    "misc" DOUBLE PRECISION,
    "expenseDescription" TEXT,

    CONSTRAINT "TimesheetDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeTimesheetToken_employeeId_key" ON "EmployeeTimesheetToken"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeTimesheetToken_token_key" ON "EmployeeTimesheetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Timesheet_employeeId_weekEnding_key" ON "Timesheet"("employeeId", "weekEnding");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetDay_timesheetId_date_key" ON "TimesheetDay"("timesheetId", "date");

-- AddForeignKey
ALTER TABLE "StatusChangeRequest" ADD CONSTRAINT "StatusChangeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTimesheetToken" ADD CONSTRAINT "EmployeeTimesheetToken_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetDay" ADD CONSTRAINT "TimesheetDay_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
