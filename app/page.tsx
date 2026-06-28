"use client";

import Link from "next/link";
import { Clock, Users, BarChart3, Shield, Lightbulb, Check } from "lucide-react";

const features = [
  {
    icon: Clock,
    title: "Timed and live assessments",
    description:
      "Set a countdown or run a live session — students see the timer in real time.",
  },
  {
    icon: Users,
    title: "Self-service enrolment",
    description:
      "Share a class code. Students register themselves — no spreadsheets or manual adds.",
  },
  {
    icon: BarChart3,
    title: "Instant results",
    description:
      "Grades are calculated automatically the moment a student submits.",
  },
  {
    icon: Shield,
    title: "Secure and fair",
    description:
      "Randomised question order and per-student time windows keep things honest.",
  },
];

const steps = [
  { num: "01", title: "Create a class", description: "Set up a class and get a shareable join code instantly." },
  { num: "02", title: "Build an assessment", description: "Add questions, set a time limit, and choose timed or live." },
  { num: "03", title: "Students join", description: "They register and use the code — no account invite needed." },
  { num: "04", title: "Review results", description: "Grades appear automatically once submissions close." },
];

const instructorItems = [
  "Build question banks",
  "Schedule or launch live",
  "View per-student results",
  "Export grades as CSV",
];

const studentItems = [
  "Self-register in seconds",
  "Join multiple classes",
  "See upcoming assessments",
  "Review past results",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-medium text-base">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Lightbulb size={16} />
            </div>
            Online Paper
          </div>
          <nav className="flex items-center gap-1">
            <button className="hidden sm:block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              Features
            </button>
            <button className="hidden sm:block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              For instructors
            </button>
            <Link href="/login" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              Log in
            </Link>
            <Link href="/register" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Self-service assessments
        </div>
        <h1 className="mb-5 text-5xl font-semibold tracking-tight leading-tight">
          Run assessments that{" "}
          <span className="text-primary">actually work</span>
        </h1>
        <p className="mx-auto mb-10 max-w-xl text-lg text-muted-foreground leading-relaxed">
          Create, schedule, and grade assessments online. Students self-register
          and join your class in seconds — no IT setup needed.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/register" className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Start for free
          </Link>
          <button className="rounded-md border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
            See how it works
          </button>
        </div>
      </section>

      {/* Stats */}
      <div className="border-y border-border">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 text-center">
            {[
              { num: "60s", label: "to create an assessment" },
              { num: "Live", label: "and timed modes" },
              { num: "0", label: "IT setup required" },
              { num: "∞", label: "students per class" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-semibold">{s.num}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-primary">Features</p>
        <h2 className="mb-3 text-3xl font-semibold tracking-tight">Everything you need to run a class</h2>
        <p className="mb-10 max-w-md text-base text-muted-foreground">From writing questions to reviewing results — all in one place.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon size={20} />
              </div>
              <h3 className="mb-2 text-sm font-medium">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-primary">Roles</p>
        <h2 className="mb-3 text-3xl font-semibold tracking-tight">Built for instructors and students</h2>
        <p className="mb-10 max-w-md text-base text-muted-foreground">Two distinct experiences — one simple platform.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-8">
            <p className="mb-4 text-xs font-medium uppercase tracking-widest text-primary">Instructor</p>
            <h3 className="mb-2 text-2xl font-semibold">You&apos;re in control</h3>
            <p className="mb-6 text-sm text-muted-foreground leading-relaxed">Create classes, build assessments, and track how every student is doing.</p>
            <ul className="flex flex-col gap-3">
              {instructorItems.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <Check size={15} className="text-primary shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-8">
            <p className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">Student</p>
            <h3 className="mb-2 text-2xl font-semibold">Simple to join</h3>
            <p className="mb-6 text-sm text-muted-foreground leading-relaxed">Register, enter a class code, and sit your assessments — all from a browser.</p>
            <ul className="flex flex-col gap-3">
              {studentItems.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <Check size={15} className="text-primary shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-primary">How it works</p>
        <h2 className="mb-3 text-3xl font-semibold tracking-tight">Up and running in minutes</h2>
        <p className="mb-10 max-w-md text-base text-muted-foreground">No training sessions. No IT tickets.</p>
        <div className="grid divide-y sm:divide-y-0 sm:divide-x divide-border rounded-xl border border-border overflow-hidden sm:grid-cols-4">
          {steps.map((step) => (
            <div key={step.num} className="p-6">
              <p className="mb-3 text-xs font-medium text-primary">{step.num}</p>
              <h4 className="mb-1.5 text-sm font-medium">{step.title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-6 mb-20 rounded-2xl border border-border bg-card px-8 py-16 text-center sm:mx-auto sm:max-w-5xl">
        <h2 className="mb-3 text-3xl font-semibold tracking-tight">Ready to run your first assessment?</h2>
        <p className="mb-8 text-base text-muted-foreground">Free to start. No credit card required.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/register" className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Create a free account
          </Link>
          <Link href="/login" className="rounded-md border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
            Log in
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground">
              <Lightbulb size={12} />
            </div>
            Online Paper
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Online Paper. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
