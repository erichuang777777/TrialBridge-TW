"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import TrialLogo from "@/app/components/TrialLogo";
import { useAuth, type Portal } from "@/app/auth-context";

const ROLES: [Portal, string][] = [
  ["patient", "Patient"],
  ["clinician", "Clinician"],
  ["partner", "Partners"],
];

function isPortal(v: string | null): v is Portal {
  return v === "patient" || v === "clinician" || v === "partner";
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, mounted, signUp } = useAuth();

  const initialPortal: Portal = isPortal(params.get("portal")) ? (params.get("portal") as Portal) : "patient";
  const [portal, setPortal] = useState<Portal>(initialPortal);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mounted && user) router.replace("/");
  }, [mounted, user, router]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and a password.");
      return;
    }
    signUp(name, email, password, portal);
    router.push("/");
  }

  return (
    <div className="auth-card">
      <Link href="/" className="auth-brand" aria-label="Trialign home">
        <TrialLogo />
        <span>Trialign</span>
      </Link>
      <h1>Create your account</h1>
      <p className="auth-sub">Demo account — explore the signed-in experience.</p>

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="auth-field">
          <span>I&apos;m signing up as</span>
          <div className="auth-roles" role="tablist" aria-label="Account type">
            {ROLES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={portal === id}
                className={`auth-role${portal === id ? " on" : ""}`}
                onClick={() => setPortal(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="auth-field">
          <span>Name</span>
          <input className="auth-input" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </label>
        <label className="auth-field">
          <span>Email</span>
          <input
            className="auth-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <input
            className="auth-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password"
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="btn go auth-submit">
          Create account
        </button>
      </form>

      <p className="auth-alt">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
      <p className="auth-demo-note">Demo sign-up — this creates a local session only; no real account, credentials, or patient data are stored.</p>
      <Link href="/" className="auth-back">
        ← Back to home
      </Link>
    </div>
  );
}

export default function SignupPage() {
  return (
    <main className="auth-page">
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </main>
  );
}
