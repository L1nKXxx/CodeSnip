import { defineCollection, z } from "astro:content";

const docs = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    sidebar: z.object({
      group: z.string(),
      order: z.number(),
    }),
  }),
});

export const collections = { docs };

