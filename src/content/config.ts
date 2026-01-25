import { defineCollection, z } from 'astro:content';

const commands = defineCollection({
  type: 'data',
  schema: z.object({
    categories: z.array(
      z.object({
        name: z.string(),
        commands: z.array(
          z.object({
            command: z.string(),
            description: z.string(),
          }),
        ),
      }),
    ),
  }),
});

const rules = defineCollection({
  type: 'data',
  schema: z.object({
    serverIp: z.string().optional(),
    warning: z.string(),
    minecraft: z.object({
      title: z.string(),
      items: z.array(z.object({ title: z.string(), html: z.string() })),
    }),
    discord: z.object({
      title: z.string(),
      items: z.array(z.object({ title: z.string(), html: z.string() })),
    }),
  }),
});
const faq = defineCollection({
  type: 'data',
  schema: z.array(
    z.object({
      title: z.string(),
      icon: z.enum(['BookOpen', 'Hammer', 'Shield', 'Cpu']),
      items: z.array(z.object({ q: z.string(), a: z.string() })),
    }),
  ),
});

export const collections = { commands, rules, faq };
