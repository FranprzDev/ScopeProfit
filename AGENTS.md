# Repository typing conventions

- Use Prisma-generated enums for closed domain values; do not compare domain status strings to inline arrays.
- Do not introduce `any` in application or test code. Use the existing domain type, a Prisma payload type, a specific DTO, `unknown`, or a validated type guard.
- Run the relevant typecheck and tests after changing types.
