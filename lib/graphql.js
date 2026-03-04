import fs from "node:fs/promises";
import * as gql from "graphql";

const sdl = await fs.readFile(
  new URL("../schema.graphql", import.meta.url),
  "utf8",
);
const schema = gql.buildSchema(sdl, {
  assumeValid: true,
  assumeValidSDL: true,
});

export function validate(query) {
  const errors = gql.validate(schema, gql.parse(query));
  if (!errors?.length) return undefined;

  return errors;
}
