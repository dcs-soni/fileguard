declare module 'clamscan' {
  interface ClamScanOptions {
    removeInfected?: boolean;
    quarantineInfected?: boolean;
    scanRecursively?: boolean;
    debugMode?: boolean;
    clamdscan?: {
      socket?: boolean | string;
      host?: string;
      port?: number;
      timeout?: number;
      localFallback?: boolean;
      active?: boolean;
    };
    clamscan?: {
      path?: string;
      active?: boolean;
    };
    preference?: 'clamdscan' | 'clamscan';
  }

  interface ScanResult {
    isInfected: boolean;
    viruses: string[];
    file?: string;
  }

  interface ScanDirResult {
    isInfected: boolean;
    badFiles?: string[];
    fileCount?: number;
    error?: string;
  }

  class NodeClam {
    constructor();
    init(options: ClamScanOptions): Promise<NodeClam>;
    scanFile(filePath: string): Promise<ScanResult>;
    scanDir(directoryPath: string): Promise<ScanDirResult>;
    scanStream(stream: Buffer | NodeJS.ReadableStream): Promise<ScanResult>;
    getVersion(): Promise<string>;
  }

  export default NodeClam;
}
