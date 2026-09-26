# Repository typing conventions

- Use Prisma-generated enums for closed domain values; do not compare domain status strings to inline arrays.
- Do not introduce `any` in application or test code. Use the existing domain type, a Prisma payload type, a specific DTO, `unknown`, or a validated type guard.
- Run the relevant typecheck and tests after changing types.

# Code Review Conventions

- Use enums or shared types from `@scopeprofit/contracts` for all domain values (error codes, status strings, diff kinds). Never use inline string literals.
- Extract inline object types to named type definitions when used in 2+ places.
- Prefer `async/await` over `.then().catch()` chains.
- Validate only what's necessary: `!value` before `Array.isArray(value)` is redundant.
- Use abstraction services (e.g., `StorageService`) instead of direct `fs` calls to enable future migrations.
- Style changes (CSS framework migrations) should be in dedicated PRs, never mixed with feature work.
