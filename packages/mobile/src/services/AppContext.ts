import {
  runMigrations,
  MeetingRepository,
  TranscriptRepository,
  ProtocolRepository,
} from '@reineke/shared';
import { ExpoSqliteAdapter } from './ExpoSqliteAdapter';

let cached: AppContext | null = null;

export interface AppContext {
  db: ExpoSqliteAdapter;
  meetings: MeetingRepository;
  transcripts: TranscriptRepository;
  protocols: ProtocolRepository;
}

export function getAppContext(): AppContext {
  if (cached) return cached;
  const db = new ExpoSqliteAdapter('reineke.sqlite');
  runMigrations(db);
  cached = {
    db,
    meetings: new MeetingRepository(db),
    transcripts: new TranscriptRepository(db),
    protocols: new ProtocolRepository(db),
  };
  return cached;
}
