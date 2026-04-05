# BackendHero Agent Guide

This document is for coding agents working in this repository.
It captures commands, conventions, and practical guardrails.
Use it as the primary instruction set for repo-specific work.

## Project Snapshot

- Stack: NestJS 11 + TypeScript + Prisma + PostgreSQL + Jest.
- Package manager: npm (use `npm`, not yarn/pnpm).
- API source root: `src/`.
- Unit/integration tests: colocated as `src/**/*.spec.ts`.
- E2E tests: `test/**/*.e2e-spec.ts`.
- Prisma schema: `prisma/schema.prisma`.
- Default HTTP port: `3000`.
- WebSocket namespace: `/notifications`.

## Cursor / Copilot Rules

Checked paths:

- `.cursorrules`
- `.cursor/rules/`
- `.github/copilot-instructions.md`

Result: no Cursor or Copilot instruction files were found in this repository.
If those files are added later, update this section and follow them.

## Setup Commands

- Install dependencies: `npm install`
- Generate Prisma client: `npx prisma generate`
- Apply dev migrations: `npx prisma migrate dev`
- Open Prisma Studio: `npx prisma studio`
- Run API (watch mode): `npm run start:dev`

Notes:

- In PowerShell environments with execution policy restrictions, use `npx.cmd` instead of `npx` (example: `npx.cmd prisma generate`).

## Build / Lint / Format Commands

- Build app: `npm run build`
- Start prod build: `npm run start:prod`
- Lint (auto-fixes enabled): `npm run lint`
- Lint check without auto-fix:
  `npx eslint "{src,apps,libs,test}/**/*.ts"`
- Format code: `npm run format`

Notes:

- `npm run lint` uses `--fix`; it may modify files.
- Prettier uses single quotes and trailing commas.

## Test Commands

- Run all unit tests: `npm run test`
- Watch mode: `npm run test:watch`
- Coverage: `npm run test:cov`
- Debug tests: `npm run test:debug`
- Run e2e tests: `npm run test:e2e`

### Run a Single Test File (important)

- Unit test file by path:
  `npm run test -- --runTestsByPath src/cliente/cliente.service.spec.ts`
- Factura service file:
  `npm run test -- --runTestsByPath src/factura/factura.service.spec.ts`
- Cliente-plan service file:
  `npm run test -- --runTestsByPath src/cliente-plan/cliente-plan.service.spec.ts`
- Unit test file (short form):
  `npm run test -- src/cliente/cliente.service.spec.ts`
- E2E single file:
  `npm run test:e2e -- --runTestsByPath test/app.e2e-spec.ts`

### Run a Single Test Case

- By test name pattern:
  `npm run test -- -t "should be defined"`
- Combined file + test name:
  `npm run test -- src/plan/plan.service.spec.ts -t "should be defined"`

## Architecture and Module Conventions

- Follow Nest module boundaries: controller + service + module per domain.
- Keep domain folders in `src/<domain>/` (kebab-case folder names).
- DTOs live in `src/<domain>/dto/`.
- Entities (when used) live in `src/<domain>/entities/`.
- Prisma access goes through injected `PrismaService`.
- Cross-module service use should be wired through module imports/exports.

## Facturacion y Devoluciones

- `CambioPlan.montoDevuelto` is legacy/backfill-only. New logic must use:
  - `devolucionPendiente`
  - `devolucionDevueltaAcumulada`
- `EstadoDevolucion` includes: `PENDIENTE`, `PARCIAL`, `COMPLETADO`, `NO_APLICA`.
- Partial refund audit lives in `DevolucionMovimiento`.
- Endpoint `POST /facturas/:id/devolver` receives:
  - `monto` (required, `> 0`)
  - `motivo` (optional)
- `GET /facturas` and `GET /facturas/:id` return refund fields flat per row:
  - `devolucionPendiente`
  - `devolucionDevueltaAcumulada`
  - `estadoDevolucion`
- `GET /cliente*` returns top-level `devolucionPendiente` (sum of pending amounts for the client).
- Business rule on plan change:
  - Either there is `faltante` or there is `devolucionPendiente`.
  - Never both at the same time.

## Cliente and Plan Behavior

- `Cliente.activo` is a soft-delete flag; client records are reactivated with `PATCH /cliente/:id/reactivar`.
- `DELETE /cliente/:id` now delegates to soft deactivation instead of physical deletion.
- `GET /cliente` defaults to active clients only.
- `GET /cliente?activo=false` lists only inactive clients.
- `GET /cliente?incluirInactivos=true` includes both active and inactive clients.
- Client login must be blocked when `cliente.activo === false`.
- In client payloads, `planes[0]` is expected to represent the active current plan only.
- Queries that feed client lists/details should filter plans by:
  - `activado: true`
  - `estado: 'ACTIVO'`
- `diaPago` is not provided by frontend requests; calculate it from `fechaInicio`.
- Use UTC day extraction for that calculation to avoid timezone drift.

## Multi-tenant / SaaS Transition

- Fase 1 SaaS base already exists in Prisma:
  - `Tenant`
  - `UserTenant`
  - `TenantModule`
- Legacy default tenant slug is `gym-principal`.
- `Usuario.email` is transitional; login still uses `cedula`.
- `cedula` should remain required for new users while auth still depends on it.
- JWT payloads may include:
  - `tenantId`
  - `tenantRole`
- If a legacy client has no `UserTenant`, auth may fall back to `cliente.tenantId`.
- Temporary fallback helpers exist for the legacy tenant during migration; avoid expanding that pattern unnecessarily.

### Tenantized Core Already Implemented

- The current tenantized core tables are:
  - `Cliente`
  - `Plan`
  - `ClientePlan`
  - `Pago`
  - `Deuda`
  - `Factura`
- These tables must always persist and query `tenantId`.
- Service methods for tenantized modules should validate records by `id + tenantId`, not by `id` alone.
- Controllers for tenantized modules should resolve tenant from `req.user.tenantId`.
- Do not add new reads/writes to these modules without tenant filtering.
- Backfill strategy for existing records uses the legacy tenant `gym-principal`.

### Remaining Modules To Tenantize Later

- `Asistencia`
- `Rutina`
- `Entrenamiento`
- `Notifications`
- `Estadisticas`
- Other secondary gym modules should follow after the financial/core flow is validated.

## Code Style Rules

### Formatting

- Use Prettier defaults from `.prettierrc`: single quotes, trailing commas, `endOfLine: auto`.
- Do not hand-format against Prettier output.
- Keep files ASCII unless existing file requires Unicode.

### Imports

- Prefer this order: Nest/framework, third-party, then internal (`src/...` or relative).
- Keep import style consistent with the surrounding file.
- Avoid introducing unused imports.

### Types and DTOs

- Use DTO classes + `class-validator` for request validation.
- Prefer explicit types for public service/controller method signatures.
- Convert query/route strings to numbers before Prisma queries.
- Favor Prisma-generated types where helpful.
- Avoid `any` in new code even though lint currently allows it.
- Use `PartialType(CreateXDto)` for update DTOs when appropriate.

### Naming

- Class names: PascalCase (`ClienteService`).
- Methods/variables: camelCase.
- File names: kebab-case with `*.controller.ts`, `*.service.ts`, `*.module.ts`, and `dto/create-*.dto.ts` / `dto/update-*.dto.ts`.
- Keep domain language consistent (this codebase primarily uses Spanish).
- Route paths should remain lowercase and consistent with existing endpoints.

### Controllers

- Keep controllers thin: parse inputs, delegate business logic to services.
- Apply guards/roles at controller or route level as needed.
- Reuse existing auth patterns (`JwtAuthGuard`, `RolesGuard`, `@Roles`).
- Prefer `ParseIntPipe` or explicit numeric conversion for `:id` params.
- For boolean query params, parse explicit string values (`true`/`false`, `1`/`0`) before passing to services.

### Services and Prisma

- Put business rules in services, not controllers.
- Check existence before update/delete and throw `NotFoundException`.
- Use `$transaction` for multi-step writes that must stay consistent.
- Clamp pagination inputs (existing pattern: page >= 1, limit <= 50).
- Use `select`/`include` deliberately to control payload size.
- When payment flows update invoices and debts together, use invoice `saldo` as the source of truth for regenerated debt.
- When a service helper writes inside a larger transaction, allow passing Prisma `tx` through helper methods.
- In tenantized modules, scope reads/writes by `tenantId` and prefer helper methods that resolve tenant consistently.
- During migration phases, backfill before making new foreign keys/columns non-nullable.

### Error Handling

- Prefer Nest HTTP exceptions over raw `Error` in request flows (`BadRequestException`, `UnauthorizedException`, `NotFoundException`).
- Provide user-facing messages that explain the failure clearly.
- Do not swallow errors silently; rethrow meaningful exceptions.
- For expected conflict/validation cases, fail fast before DB writes.

### Logging

- Avoid adding noisy `console.log` calls in new code.
- If logging is needed, keep it concise and actionable.
- Never log secrets, JWTs, passwords, or full personal data.

## Testing Conventions

- Keep tests next to implementation as `*.spec.ts` in `src/`.
- Use `@nestjs/testing` `Test.createTestingModule(...)` patterns.
- Mock Prisma/service dependencies for unit tests.
- Add/adjust tests when business logic changes.
- Prefer focused assertions over broad snapshot-like checks.

## Auth and Security Expectations

- JWT secret comes from `process.env.JWT_SECRET` (fallback exists in code).
- Database URL comes from `DATABASE_URL`.
- Passwords must be hashed with `bcrypt` before persistence.
- Role checks use `rol` claim + `Role` enum semantics.
- `POST /usuarios` is currently public in code; if exposing production endpoints, protect or gate bootstrap user creation.

## Agent Workflow Checklist

When making code changes:

1. Read nearby module/controller/service/DTO patterns first.
2. Implement changes in the smallest coherent scope.
3. Run relevant lint/tests (single-file test when possible).
4. If touching persistence logic, verify Prisma query consistency.
5. Summarize what changed and any follow-up risks.

When unsure, prefer consistency with existing module patterns over novelty.
