import Link from "next/link";
import { PenLine } from "lucide-react";
import { Lora, Caveat } from "next/font/google";

const lora = Lora({ subsets: ["latin"], weight: ["500", "600", "700"] });
const caveat = Caveat({ subsets: ["latin"], weight: ["600", "700"] });

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-medium text-base">
            <PenLine size={18} className="text-primary" strokeWidth={2.25} />
            <span className={lora.className}>Online Paper</span>
          </div>
          <nav className="flex items-center gap-1">
            <Link
              href="/login"
              className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded px-3 py-1.5 text-sm font-medium border border-border hover:bg-muted transition-colors"
            >
              Set up a class
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="relative w-full max-w-2xl">
          {/* handwritten grading mark */}
          <div
            className={`${caveat.className} absolute -top-6 -right-2 sm:-right-8 rotate-[-6deg] text-primary text-3xl select-none pointer-events-none z-10`}
          >
            looks good! ✓
          </div>

          {/* the "paper" */}
          <div className="relative overflow-hidden rounded-sm border border-border bg-card px-8 py-14 sm:px-16 shadow-sm">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to bottom, transparent, transparent 35px, #60a5fa 36px)",
                opacity: 0.3,
              }}
            />
            <div className="absolute left-10 sm:left-14 top-0 bottom-0 w-0.5 bg-red-400" />

            <div className="relative text-center sm:text-left">
              <h1
                className={`${lora.className} mb-4 text-4xl sm:text-[2.75rem] font-semibold tracking-tight leading-[1.15]`}
              >
                Quizzes, without
                <br className="hidden sm:block" /> the paperwork.
              </h1>
              <p className="mb-8 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                Write a quiz, share one link, and let the class join themselves
                — no roster to build, no passwords to hand out. Grading happens
                while you're pouring coffee.
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <Link
                  href="/register"
                  className="rounded bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Set up my class
                </Link>
                <Link
                  href="/login"
                  className="rounded border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Log in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-border">
        <div className="mx-auto max-w-4xl px-6 py-8 flex items-center justify-between text-xs text-muted-foreground">
          <div className={`${lora.className} flex items-center gap-1.5`}>
            <PenLine size={12} className="text-primary" />
            Online Paper
          </div>
          <p>&copy; {new Date().getFullYear()} Online Paper.</p>
        </div>
      </footer>
    </div>
  );
}
