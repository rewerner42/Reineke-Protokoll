export interface ToDo {
  id: string;
  protocolId: string;
  description: string;
  owner: string | null;
  deadline: string | null;
  done: boolean;
}
