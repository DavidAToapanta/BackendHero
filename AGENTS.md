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

### Services and Prisma

- Put business rules in services, not controllers.
- Check existence before update/delete and throw `NotFoundException`.
- Use `$transaction` for multi-step writes that must stay consistent.
- Clamp pagination inputs (existing pattern: page >= 1, limit <= 50).
- Use `select`/`include` deliberately to control payload size.

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

## Agent Workflow Checklist

When making code changes:

1. Read nearby module/controller/service/DTO patterns first.
2. Implement changes in the smallest coherent scope.
3. Run relevant lint/tests (single-file test when possible).
4. If touching persistence logic, verify Prisma query consistency.
5. Summarize what changed and any follow-up risks.

When unsure, prefer consistency with existing module patterns over novelty.
