export interface FileRec {
  id: string;
  name: string;
  mime: string;
  size: number;
  folderId: string | null;
  addedAt: number;
  status: 'processing' | 'ready' | 'error';
  progress?: string;
  text: string;
  ocr: boolean;
  error?: string;
  /** Pochodzenie z Dysku Google — pozwala synchronizować zmiany. */
  source?: { kind: 'drive'; id: string; rootId: string; modifiedTime: string };
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  /** Folder główny połączony z folderem na Dysku Google. */
  drive?: { id: string; syncedAt?: number };
}

export interface SourceRef {
  fileId: string;
  fileName: string;
  excerpt: string;
  offset?: number;
}

export type BlockType = 'heading' | 'text' | 'table' | 'list' | 'chart';

export interface Block {
  id: string;
  type: BlockType;
  text: string; // heading/text/list (lista: linie rozdzielone \n)
  level?: 1 | 2 | 3;
  rows?: string[][]; // table — pierwszy wiersz to nagłówek
  series?: { label: string; values: number[] }; // chart
  origin: 'user' | 'ai' | 'engine';
  pending?: boolean; // propozycja AI czekająca na akceptację
  source?: SourceRef;
  createdAt: number;
}

export type PanelKind = 'viewer' | 'ocr' | 'grid' | 'chart';

export interface Panel {
  id: string;
  kind: PanelKind;
  fileId?: string;
  highlight?: string;
  title: string;
}

export interface Tab {
  id: string;
  title: string;
  blocks: Block[];
  panels: Panel[];
  history: Block[][];
  future: Block[][];
  banner?: string;
  createdAt: number;
}

export type ProviderId = 'local' | 'n8n' | 'gemini' | 'anthropic';

export interface Settings {
  provider: ProviderId;
  n8nUrl: string;
  geminiKey: string;
  geminiModel: string;
  anthropicKey: string;
  anthropicModel: string;
  linterGuards: ProviderId[];
  pCrit: number;
  includeYears: boolean;
  googleClientId: string;
}

export interface MarketSeries {
  id: string;
  name: string;
  unit: string;
  values: number[];
  sample: boolean;
}
