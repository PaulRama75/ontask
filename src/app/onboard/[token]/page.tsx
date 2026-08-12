import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import OnboardingForm from "./OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const link = await prisma.onboardingLink.findUnique({
    where: { token },
    include: { employee: true },
  });

  if (!link) notFound();

  const e = link.employee;

  return (
    <main className="min-h-screen bg-slate-950 py-10">
      <div className="mx-auto max-w-3xl px-4">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-400">
            FER Onboarding
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">
            Complete your employee onboarding
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Fill out your information and attach the required documents. Fields
            marked <span className="text-rose-400">*</span> are required.
          </p>
        </header>

        <OnboardingForm
          token={token}
          alreadySubmitted={link.usedAt != null}
          employee={{
            firstName: e.firstName,
            lastName: e.lastName,
            email: e.email,
            phone: e.phone,
            ssn: e.ssn,
            addressLine1: e.addressLine1,
            addressLine2: e.addressLine2,
            city: e.city,
            state: e.state,
            zip: e.zip,
            driversLicenseNumber: e.driversLicenseNumber,
            safetyCouncilId: e.safetyCouncilId,
            twicNumber: e.twicNumber,
            status: e.status,
          }}
        />
      </div>
    </main>
  );
}
