import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import type { Protocol, LLMProviderName } from '../../models/Protocol.js';
import type { Participant } from '../../models/Participant.js';
import type { ToDo } from '../../models/ToDo.js';
import { newId } from '../../utils/id.js';
import { nowIso } from '../../utils/date.js';

interface ProtocolRow {
  id: string;
  meeting_id: string;
  summary: string;
  decisions_json: string;
  discussion_points_json: string;
  markdown: string;
  llm_provider: LLMProviderName;
  llm_model: string;
  generated_at: string;
  edited_at: string | null;
}

interface ParticipantRow {
  id: string;
  meeting_id: string;
  name: string;
  role: string | null;
}

interface ToDoRow {
  id: string;
  protocol_id: string;
  description: string;
  owner: string | null;
  deadline: string | null;
  done: number;
}

export interface SaveProtocolInput {
  meetingId: string;
  summary: string;
  participants: Array<Omit<Participant, 'id' | 'meetingId'>>;
  todos: Array<Omit<ToDo, 'id' | 'protocolId' | 'done'>>;
  decisions: string[];
  discussionPoints: string[];
  markdown: string;
  llmProvider: LLMProviderName;
  llmModel: string;
}

export class ProtocolRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  save(input: SaveProtocolInput): Protocol {
    return this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM protocols WHERE meeting_id = ?')
        .run(input.meetingId);
      this.db
        .prepare('DELETE FROM participants WHERE meeting_id = ?')
        .run(input.meetingId);

      const protocolId = newId();
      const generatedAt = nowIso();

      this.db
        .prepare(
          `INSERT INTO protocols
           (id, meeting_id, summary, decisions_json, discussion_points_json,
            markdown, llm_provider, llm_model, generated_at, edited_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          protocolId,
          input.meetingId,
          input.summary,
          JSON.stringify(input.decisions),
          JSON.stringify(input.discussionPoints),
          input.markdown,
          input.llmProvider,
          input.llmModel,
          generatedAt,
        );

      const participants: Participant[] = input.participants.map((p) => {
        const participant: Participant = {
          id: newId(),
          meetingId: input.meetingId,
          name: p.name,
          role: p.role,
        };
        this.db
          .prepare(
            `INSERT INTO participants (id, meeting_id, name, role) VALUES (?, ?, ?, ?)`,
          )
          .run(participant.id, participant.meetingId, participant.name, participant.role);
        return participant;
      });

      const todos: ToDo[] = input.todos.map((t) => {
        const todo: ToDo = {
          id: newId(),
          protocolId,
          description: t.description,
          owner: t.owner,
          deadline: t.deadline,
          done: false,
        };
        this.db
          .prepare(
            `INSERT INTO todos (id, protocol_id, description, owner, deadline, done)
             VALUES (?, ?, ?, ?, ?, 0)`,
          )
          .run(todo.id, todo.protocolId, todo.description, todo.owner, todo.deadline);
        return todo;
      });

      const protocol: Protocol = {
        id: protocolId,
        meetingId: input.meetingId,
        summary: input.summary,
        participants,
        todos,
        decisions: input.decisions,
        discussionPoints: input.discussionPoints,
        markdown: input.markdown,
        llmProvider: input.llmProvider,
        llmModel: input.llmModel,
        generatedAt,
        editedAt: null,
      };
      return protocol;
    });
  }

  getByMeetingId(meetingId: string): Protocol | null {
    const row = this.db
      .prepare<ProtocolRow>('SELECT * FROM protocols WHERE meeting_id = ?')
      .get(meetingId);
    if (!row) return null;

    const participants = this.db
      .prepare<ParticipantRow>('SELECT * FROM participants WHERE meeting_id = ?')
      .all(meetingId)
      .map((p) => ({ id: p.id, meetingId: p.meeting_id, name: p.name, role: p.role }));

    const todos = this.db
      .prepare<ToDoRow>('SELECT * FROM todos WHERE protocol_id = ?')
      .all(row.id)
      .map((t) => ({
        id: t.id,
        protocolId: t.protocol_id,
        description: t.description,
        owner: t.owner,
        deadline: t.deadline,
        done: t.done === 1,
      }));

    return {
      id: row.id,
      meetingId: row.meeting_id,
      summary: row.summary,
      participants,
      todos,
      decisions: JSON.parse(row.decisions_json) as string[],
      discussionPoints: JSON.parse(row.discussion_points_json) as string[],
      markdown: row.markdown,
      llmProvider: row.llm_provider,
      llmModel: row.llm_model,
      generatedAt: row.generated_at,
      editedAt: row.edited_at,
    };
  }

  updateMarkdown(protocolId: string, markdown: string): void {
    this.db
      .prepare('UPDATE protocols SET markdown = ?, edited_at = ? WHERE id = ?')
      .run(markdown, nowIso(), protocolId);
  }

  setTodoDone(todoId: string, done: boolean): void {
    this.db.prepare('UPDATE todos SET done = ? WHERE id = ?').run(done ? 1 : 0, todoId);
  }
}
