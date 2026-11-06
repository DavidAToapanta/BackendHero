# BackendHero Agent Notes

## Runtime Shape
- `README.md` is the default Nest starter README; prefer `package.json`, Nest config, Prisma files, and `apps/gym-api/src/*` as sources of truth.
- NestJS monorepo workspace with one active application, `gym-api`, and the `prisma` and `seguridad` libraries. Entry points are `apps/gym-api/src/main.ts` and `apps/gym-api/src/app.module.ts`; the production entry is `dist/apps/gym-api/src/main.js`. `tienda-api` and the other libraries remain documentation-only placeholders.
- Existing `src/*` TypeScript imports are a compatibility alias for `apps/gym-api/src/*`, not a root source directory. `gym-api` is the default project for the existing start/build commands.
- Prisma is the only data layer. `PrismaModule` and `PrismaService` live in `libs/prisma/src` and are imported through `@app/prisma`. Schema lives in `prisma/schema.prisma`; SQL migrations live in `prisma/migrations/`. The library must not import application code.
- `@app/seguridad` exports the authenticated tenant helper, JWT guard/configuration and `JwtStrategyBase`. It must not depend on Prisma or application code. Gym owns its concrete JWT payload mapping, roles and context-selection logic.

## Commands
- Install: `npm install`
- Dev server: `npm run start:dev`
- Build: `npm run build`
- Lint: `npm run lint` (runs ESLint with `--fix`, so it can modify files)
- Unit tests: `npm test`
- E2E tests: `npm run test:e2e`
- HTTP/WebSocket compatibility without a database: `npm run test:e2e:gym -- --runInBand` (uses mocked data providers).
- Focused unit test: `npx jest apps/gym-api/src/auth/auth.service.spec.ts`
- Prisma library test: `npx jest libs/prisma/src/prisma.module.spec.ts`
- Shared security tests: `npx jest libs/seguridad/src`
- Focused e2e test: `npx jest --config ./test/jest-e2e.json test/app.e2e-spec.ts`
- No dedicated typecheck script exists; use `npx tsc --noEmit` if you need one.

## Env And Services
- Runtime code reads `process.env` directly; there is no `@nestjs/config` or app-level dotenv bootstrap. Do not assume Nest loads `.env` for runtime execution.
- Prisma uses `DATABASE_URL`; the checked-in `.env` points to local Postgres at `127.0.0.1:5433/SistemaGym`.
- `JWT_SECRET` is optional in local work because auth and sockets fall back to `'supersecret'`; `PORT` defaults to `8080`.
- `apps/gym-api/src/main.ts` raises JSON/urlencoded body limits to `50mb`.
- `test/app.e2e-spec.ts` boots the real `AppModule`, so e2e runs need a working database connection.

## Architecture Invariants
- This codebase is tenant-aware. Protected controllers usually resolve the tenant from `req.user` via `getTenantIdOrThrow()` exported by `@app/seguridad` and pass it into services.
- Do not add or trust `tenantId` from request body/query on protected routes unless the existing flow already does so; tests explicitly protect against that in several modules.
- Some services still support a legacy fallback tenant by calling `resolveTenantIdOrDefault()`, which resolves slug `gym-principal` if no tenant is provided.

## Auth And Roles
- Auth is context-based, not just login -> token. `POST /auth/login` can return `requiresContextSelection` plus a `selectionToken`; changes to login must preserve `POST /auth/select-context`.
- `JwtStrategy` exposes both `rol` and `tenantRole`, but `RolesGuard` treats `tenantRole` as the source of truth for staff routes.
- Shared JWT configuration preserves access tokens of one day and selection tokens of ten minutes. The concrete strategy remains in Gym and extends the shared technical base; do not move Gym authorization policies into that base.
- `Role.CLIENTE` is intentionally isolated from staff roles. `OWNER` inherits `ADMIN` only through `RolesGuard`; do not spread that assumption elsewhere.

## Realtime
- WebSocket notifications use namespace `notifications` in `apps/gym-api/src/notifications/notifications.gateway.ts`.
- Tenant fanout is room-based (`tenant:<id>`). The gateway prefers tenantId from a verified JWT and only falls back to handshake `tenantId` for local/dev compatibility.

## Verification Order
- For code changes, the safest repo-local sequence is `npm run lint`, then `npm test`, then `npm run build`.
