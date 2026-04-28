import type { Metadata } from "next";

import { Section, SectionContent } from "@/components/layout/section";
import { FooterSection } from "@/components/sections/footer-section";

import { EnterpriseForm } from "./enterprise-form";

export const metadata: Metadata = {
  title: "Enterprise – PayKit",
  description: "Get support from our team and deploy PayKit securely inside your organization.",
};

export default function EnterprisePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Section className="flex-1">
        <SectionContent className="px-12 pt-24 pb-24 lg:pt-36">
          <div className="mx-auto max-w-lg">
            <div className="space-y-3 text-center">
              <h1 className="text-foreground/90 text-2xl font-semibold tracking-tight sm:text-3xl">
                PayKit for Enterprise
              </h1>
              <p className="text-foreground/45 text-sm leading-relaxed sm:text-base">
                Get support from our team and deploy PayKit securely inside your organization.
                Dedicated onboarding, priority support, and custom integrations.
              </p>
            </div>

            <div className="mt-12">
              <EnterpriseForm />
            </div>
          </div>
        </SectionContent>
      </Section>
      <FooterSection />
    </div>
  );
}
