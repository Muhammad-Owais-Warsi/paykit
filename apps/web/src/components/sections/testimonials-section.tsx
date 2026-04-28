import { Icons } from "@/components/icons";
import { Section, SectionContent } from "@/components/layout/section";
import { cn } from "@/lib/utils";

const testimonials = [
  {
    handle: "@alexdev",
    avatar: "/testimonials/placeholder-1.png",
    text: "Just integrated PayKit into our SaaS. Went from zero billing to subscriptions + usage limits in under an hour. The DX is insane.",
  },
  {
    handle: "@sarahbuilds",
    avatar: "/testimonials/placeholder-2.png",
    text: "PayKit replaced 800 lines of Stripe webhook code with a single subscribe() call. I'm never going back.",
  },
  {
    handle: "@marcuseng",
    avatar: "/testimonials/placeholder-3.png",
    text: "The fact that billing state lives in my own Postgres and I can just JOIN it with my tables is a game changer.",
  },
  {
    handle: "@devpriya",
    avatar: "/testimonials/placeholder-4.png",
    text: "We switched from Stripe's raw API to PayKit. Took 30 minutes. Our billing code went from 3 files to 1.",
  },
  {
    handle: "@joshcodes",
    avatar: "/testimonials/placeholder-5.png",
    text: "check() and report() for usage billing is exactly what I needed. No more custom middleware to gate features.",
  },
  {
    handle: "@emmaoss",
    avatar: "/testimonials/placeholder-6.png",
    text: "Open source billing that actually works. No vendor lock-in, no separate dashboard, just npm install and go.",
  },
  {
    handle: "@ryanships",
    avatar: "/testimonials/placeholder-7.png",
    text: "The type safety is incredible. Typo a plan ID and TypeScript catches it before you even run the code.",
  },
  {
    handle: "@linadev",
    avatar: "/testimonials/placeholder-8.png",
    text: "PayKit feels like what Stripe should have been for framework developers. Simple, embedded, type-safe.",
  },
];

// Split into 3 columns for masonry layout
const columns = [
  testimonials.filter((_, i) => i % 3 === 0),
  testimonials.filter((_, i) => i % 3 === 1),
  testimonials.filter((_, i) => i % 3 === 2),
];

function TestimonialCard({ handle, text }: { handle: string; avatar: string; text: string }) {
  return (
    <div className="border-foreground/[0.08] rounded-[10px] border p-[4px]">
      <div className="flex flex-col gap-3 rounded-md border border-foreground/[0.06] p-4">
        <div className="flex items-center gap-2.5">
          <div className="bg-foreground/[0.08] size-8 rounded-full" />
          <div className="flex items-center gap-1.5">
            <Icons.XIcon className="text-foreground/30 size-3" />
            <span className="text-foreground/60 text-sm font-medium">{handle}</span>
          </div>
        </div>
        <p className="text-foreground/50 text-sm leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

export function TestimonialsSection() {
  return (
    <Section>
      <SectionContent>
        <div className="mb-10 text-center">
          <h2 className="text-foreground/90 text-xl font-semibold tracking-tight sm:text-2xl">
            Loved by developers
          </h2>
          <p className="text-foreground/45 mx-auto mt-2 max-w-md text-sm leading-relaxed sm:text-base">
            See what developers are saying about PayKit.
          </p>
        </div>

        {/* Masonry columns with fade at edges */}
        <div className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              maskImage:
                "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
            }}
          />
          <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3")}>
            {columns.map((column, colIdx) => (
              <div
                key={colIdx}
                className={cn("flex flex-col gap-4", colIdx === 1 && "lg:-translate-y-6")}
              >
                {column.map((testimonial) => (
                  <TestimonialCard key={testimonial.handle} {...testimonial} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </SectionContent>
    </Section>
  );
}
