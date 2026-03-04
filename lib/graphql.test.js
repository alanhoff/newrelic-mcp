import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "./graphql.js";

test("validate returns undefined for schema-valid query", () => {
  const errors = validate(`
    query {
      __type(name: "Query") {
        name
      }
    }
  `);

  assert.equal(errors, undefined);
});

test("validate returns validation errors for schema-invalid query", () => {
  const errors = validate(`
    query {
      actor {
        definitelyMissingField
      }
    }
  `);

  assert.ok(Array.isArray(errors));
  assert.ok(errors.length > 0);
  assert.match(
    errors[0].message,
    /Cannot query field "definitelyMissingField"/,
  );
});

test("validate surfaces parse errors from graphql parser", () => {
  assert.throws(
    () =>
      validate(`
        query {
      `),
    /Syntax Error/,
  );
});
