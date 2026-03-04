import _ from "lodash";
import mapObject from "map-obj";
import { z } from "zod";

const TagSchema = z.array(
  z.object({
    key: z.string(),
    values: z.array(z.string()),
  }),
);

export const tagMapper = (obj) =>
  _.isPlainObject(obj)
    ? mapObject(
        obj,
        (key, value) =>
          key === "tags" && TagSchema.safeParse(value).success
            ? [
                key,
                value.flatMap(({ key: name, values }) =>
                  values.map((v) => `${name}:${v}`),
                ),
              ]
            : [key, value],
        { deep: true },
      )
    : obj;
