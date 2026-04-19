# BackendHero Agent Notes

## Runtime Shape
- Single NestJS app, not a monorepo. Entry points are `src/main.ts` and `src/app.module.ts`; Nest source root is `src`, build output is `dist`.
- Prisma is the only data layer. Schema lives in `prisma/schema.prisma`; SQL migrations live in `prisma/migrations/`.

## Commands
- Install: `npm install`
- Dev server: `npm run start:dev`
- Build: `npm run build`
- Lint: `npm run lint` (runs ESLint with `--fix`, so it can modify files)
- Unit tests: `npm test`
- E2E tests: `npm run test:e2e`
- Focused unit test: `npx jest src/auth/auth.service.spec.ts`
- Focused e2e test: `npx jest --config ./test/jest-e2e.json test/app.e2e-spec.ts`
- No dedicated typecheck script exists; use `npx tsc --noEmit` if you need one.

## Env And Services
- The app reads `process.env` directly in runtime code; there is no `@nestjs/config`, `ConfigModule.forRoot()`, or `dotenv` bootstrap. Do not assume Nest loads `.env` for you.
- Prisma uses `DATABASE_URL`; the checked-in `.env` points to local Postgres at `127.0.0.1:5433/SistemaGym`.
- `JWT_SECRET` is optional in local work because auth and sockets fall back to `'supersecret'`; `PORT` defaults to `8080`.
- `test/app.e2e-spec.ts` boots the real `AppModule`, so e2e runs need a working database connection.

## Architecture Invariants
- This codebase is tenant-aware. Protected controllers usually resolve the tenant from `req.user` via `getTenantIdOrThrow()` in `src/tenant/tenant-context.util.ts` and pass it into services.
- Do not add or trust `tenantId` from request body/query on protected routes unless the existing flow already does so; tests explicitly protect against that in several modules.
- Some services still support a legacy fallback tenant by calling `resolveTenantIdOrDefault()`, which resolves slug `gym-principal` if no tenant is provided.

## Auth And Roles
- Auth is context-based, not just login -> token. `POST /auth/login` can return `requiresContextSelection` plus a `selectionToken`; changes to login must preserve `POST /auth/select-context`.
- `JwtStrategy` exposes both `rol` and `tenantRole`, but `RolesGuard` treats `tenantRole` as the source of truth for staff routes.
- `Role.CLIENTE` is intentionally isolated from staff roles. `OWNER` inherits `ADMIN` only through `RolesGuard`; do not spread that assumption elsewhere.

## Realtime
- WebSocket notifications use namespace `notifications` in `src/notifications/notifications.gateway.ts`.
- Tenant fanout is room-based (`tenant:<id>`). The gateway prefers tenantId from a verified JWT and only falls back to handshake `tenantId` for local/dev compatibility.

## Verification Order
- For code changes, the safest repo-local sequence is `npm run lint`, then `npm test`, then `npm run build`.
