# Next.js App Router Sample App Fixture

A realistic Next.js (App Router) fixture in TypeScript designed for testing AST parsing, dependency graph extraction, scoped execution trace pruning, and blast radius calculation in `unfog-core`.

## Structure

```
tests/fixtures/sample-app/
├── package.json
├── tsconfig.json
├── next.config.js
├── app/
│   ├── layout.tsx             # Root layout importing Navbar
│   ├── page.tsx               # Landing page
│   ├── dashboard/
│   │   └── page.tsx           # Dashboard importing Navbar, UserCard, lib/db, hooks/useAuth
│   ├── upload/
│   │   └── page.tsx           # Upload page importing Navbar, UploadBtn, hooks/useAuth
│   └── api/
│       └── upload/
│           └── route.ts       # POST route handler importing lib/s3 and lib/db
├── components/
│   ├── Navbar.tsx             # Navigation bar importing UserCard, hooks/useAuth
│   ├── UserCard.tsx           # User profile card importing hooks/useAuth, lib/db
│   └── UploadBtn.tsx          # Upload button importing hooks/useUpload
├── hooks/
│   ├── useAuth.ts             # Authentication hook importing lib/store, lib/db
│   └── useUpload.ts           # Upload workflow hook importing lib/store, app/api/upload/route, lib/db
└── lib/
    ├── db.ts                  # Database queries (User, UploadRecord)
    ├── s3.ts                  # S3 upload client (uploadToS3, generatePresignedUrl)
    └── store.ts               # App state store importing lib/db
```

## Key Dependency Chains for Testing

### 1. Scoped Pruning Trace (Target: `/upload` route)
Execution trace:
```
app/upload/page.tsx
  └── components/UploadBtn.tsx
        └── hooks/useUpload.ts
              └── app/api/upload/route.ts
                    ├── lib/s3.ts
                    └── lib/db.ts
```
Pruned down to 5-6 core linear execution nodes.

### 2. Blast Radius Calculation (BFS Downstream)
If `lib/s3.ts` changes:
- Directly affected: `app/api/upload/route.ts`
- Downstream affected: `hooks/useUpload.ts` -> `components/UploadBtn.tsx` -> `app/upload/page.tsx`

If `lib/db.ts` changes:
- Directly affected: `lib/store.ts`, `hooks/useAuth.ts`, `app/api/upload/route.ts`, `app/dashboard/page.tsx`, `components/UserCard.tsx`
- Downstream affected: `components/Navbar.tsx`, `hooks/useUpload.ts`, `components/UploadBtn.tsx`, `app/upload/page.tsx`, `app/layout.tsx`
