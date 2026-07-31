export interface ServerProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  passwordEnc: string;
  container?: string;
}

export interface LocalTarget {
  host: string;
  port: number;
  user: string;
  passwordEnc: string;
  container?: string;
}

export interface ConfigFile {
  servers: ServerProfile[];
  localTarget?: LocalTarget;
}
