"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthState } from "./actions";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center text-lg font-semibold text-teal-800">
          RentFlow
        </Link>
        <form action={formAction} className="card space-y-4 p-6">
          <h1 className="text-xl font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h1>
          {state.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
          {mode === "signup" && (
            <label className="block">
              <span className="label">Your name</span>
              <input name="name" required className="input" autoComplete="name" />
            </label>
          )}
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" required className="input" autoComplete="email" />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              className="input"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
          <p className="text-center text-sm text-slate-500">
            {mode === "login" ? (
              <>
                New here? <Link href="/signup" className="text-teal-700 hover:underline">Create an account</Link>
              </>
            ) : (
              <>
                Already have an account? <Link href="/login" className="text-teal-700 hover:underline">Sign in</Link>
              </>
            )}
          </p>
        </form>
        {mode === "login" && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Demo: demo@rentflow.app / demo1234
          </p>
        )}
      </div>
    </main>
  );
}
