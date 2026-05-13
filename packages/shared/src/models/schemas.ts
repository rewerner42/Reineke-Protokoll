import { z } from 'zod';

export const ProtocolOutputSchema = z.object({
  summary: z.string().min(1, 'Zusammenfassung darf nicht leer sein'),
  participants: z.array(
    z.object({
      name: z.string().min(1),
      role: z.string().nullable(),
    }),
  ),
  todos: z.array(
    z.object({
      description: z.string().min(1),
      owner: z.string().nullable(),
      deadline: z.string().nullable(),
    }),
  ),
  decisions: z.array(z.string()),
  discussionPoints: z.array(z.string()),
});

export type ProtocolOutput = z.infer<typeof ProtocolOutputSchema>;

export const ProtocolInputSchema = z.object({
  transcript: z.string().min(1),
  language: z.enum(['de', 'en']),
  meetingTitle: z.string().optional(),
  knownParticipants: z.array(z.string()).optional(),
});

export type ProtocolInput = z.infer<typeof ProtocolInputSchema>;

export const PROTOCOL_JSON_SCHEMA = {
  type: 'object',
  required: ['summary', 'participants', 'todos', 'decisions', 'discussionPoints'],
  additionalProperties: false,
  properties: {
    summary: {
      type: 'string',
      description: 'Allgemeine Zusammenfassung des Meetings (3-8 Sätze).',
    },
    participants: {
      type: 'array',
      description:
        'Liste der erkannten Teilnehmer. Nur Personen, die im Transkript explizit genannt wurden.',
      items: {
        type: 'object',
        required: ['name', 'role'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          role: { type: ['string', 'null'] },
        },
      },
    },
    todos: {
      type: 'array',
      description: 'Konkrete Aufgaben, die im Meeting vergeben oder vereinbart wurden.',
      items: {
        type: 'object',
        required: ['description', 'owner', 'deadline'],
        additionalProperties: false,
        properties: {
          description: { type: 'string' },
          owner: { type: ['string', 'null'] },
          deadline: { type: ['string', 'null'] },
        },
      },
    },
    decisions: {
      type: 'array',
      description: 'Getroffene Entscheidungen, jeweils als ein Satz.',
      items: { type: 'string' },
    },
    discussionPoints: {
      type: 'array',
      description: 'Wichtige Diskussionspunkte ohne abschließende Entscheidung.',
      items: { type: 'string' },
    },
  },
} as const;
