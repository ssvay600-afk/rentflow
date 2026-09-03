#!/bin/sh
# Pre-commit guard: refuse to commit anything that looks like a Stripe key or
# webhook secret. Install with:  cp scripts/check-secrets.sh .git/hooks/pre-commit
if git diff --cached -U0 | grep -E '^\+' | grep -Eq '\b(sk|rk|rkcs|pk)_(live|test)_[A-Za-z0-9]{8,}|\bwhsec_[A-Za-z0-9]{8,}'; then
  echo "✗ Commit blocked: a Stripe key or webhook secret is in the staged changes." >&2
  echo "  Move it to .env (gitignored) or your host's environment variables." >&2
  exit 1
fi
exit 0
